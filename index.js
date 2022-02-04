require( 'trace-unhandled/register' ); // As early as possible

console.log("Startup ", new Date());
console.error("Startup ", new Date());

const gpsd = require('node-gpsd');
const BME280 = require('./BME280');
const fs = require('fs');
const sensors = require('ds18b20-raspi');  
const config = require("./config");
const {SMS} = require("./sms.js");
const { Drive } = require('./drive');
const AM2320 = require('./am2320.js');

var dat = {
    pos : {
        nf: 0,
        lat: 0,
        lon: 0,
        eph: 0,    
    },
    bme280: {

    },
    onewire: {}
};


// GPS


var listener = new gpsd.Listener();

listener.on('TPV', function (tpv) {
    if ( tpv.mode > 1 ) {
        dat.pos.nf = 0;
        if ( dat.pos.m <= 1 ) {
            dat.pos.lat = tpv.lat;
            dat.pos.lon = tpv.lon;
            dat.pos.eph = tpv.eph;
        } else {
            dat.pos.lat = tpv.lat*0.1+dat.pos.lat*0.9;
            dat.pos.lon = tpv.lon*0.1+dat.pos.lon*0.9;
            dat.pos.eph = tpv.eph*0.1+dat.pos.eph*0.9;
            dat.pos.speed = tpv.speed;
            dat.pos.time = tpv.time;
        }
        dat.pos.m = tpv.mode;
        dat.pos.ts = new Date().toUTCString();
    } else {
        // no fix
        dat.pos.nf = dat.pos.nf++;
    }
});

listener.connect(function() {
    console.log("Gps connected");
    listener.watch();
});



// read barrometer

var barometer = new BME280({address: 0x76});
async function updateBME280() {
    try {
        if ( barometer ) {
            await barometer.begin();
            const reading = await barometer.readPressureAndTemparature();
            if ( reading ) {
                dat.bme280.p = (reading.pressure/100).toFixed(1);
                dat.bme280.t = reading.temperature.toFixed(1);
                dat.bme280.h = reading.humidity.toFixed(1);
                dat.bme280.ts = new Date().toUTCString();
            }    
        }
    } catch (e) {
        console.log("Failed to read barrometer", e);
    }
}

// temperature + humidity sensor
var am2320 = new AM2320();
async function updateAM2320() {
    try {
        const reading = await am2320.read();
        dat.am2320 = reading;
    } catch(err) {
        console.log("Error Reading AM2320 ",err);
    }    
};




// Read Temperatures

async function updateTemperatures() {
    try {
        const temps = await new Promise((resolve, reject) => {
            sensors.readAllC((err, temps) => {
                if ( err ) {
                    reject(err);
                } else {
                    resolve(temps);
      
                }
            });
        });
        for(var i = 0; i < temps.length; i++) {
            dat.onewire[temps[i].id] = dat.onewire[temps[i].id] || {};
            dat.onewire[temps[i].id].m = Date.now();
            dat.onewire[temps[i].id].temp = temps[i].t;
        }
        dat.onewire.ts = new Date().toUTCString();
    } catch (e) {
        console.log("Failed reading 1 wire ",e);
    }
};

/*
setInterval(() => {
    updateTemperatures(() => {
        updateBME280(() => {
            console.log(dat);
        });
    });
},60000);
*/


function pad2Zeros(n) {
    return ("00" + n).slice(-2);
};

async function getAll() {
    await updateAM2320();
    await updateBME280();
    await updateTemperatures();
    dat.ts = Date.now();
}

// LOGFile output
async function dumpAll() {
    await getAll();
    var d = new Date();
    var fname = "data/data-"+d.getFullYear()+pad2Zeros(d.getMonth()+1)+pad2Zeros(d.getDate())+".jsonlog";
    await new Promise((resolve, reject) => {
        fs.writeFile(fname,JSON.stringify(dat)+"\n", (err) => {
            if ( err ) {
                reject(err);
            } else {
                resolve();
            }
        });       
    }); 
}

// dump everything out.
setInterval(() => {
    dumpAll().catch(err => {
        console.log("Failed saving data ",err);
    });
}, 60000);


// SMS Command processing

const sms = new SMS(config);
sms.addHandler("status", (cb) => {  
    getAll().then(() => {
        cb(`https://www.google.com/maps/search/?api=1&query=${dat.pos.lat}%2C${dat.pos.lon} lat:${dat.pos.lat} lon:${dat.pos.lon} at:${dat.pos.ts} temp:${dat.bme280.t} pressure:${dat.bme280.p} rh:${dat.bme280.h} `);
    }).catch(e => {
        console.log("Error Sending status ",err);
    });
});
sms.addHandler("full", (cb) => {  
    getAll().then(() => {
        cb(JSON.stringify(dat,null,2));
    }).catch(e => {
        console.log("Error Sending full ",err);
    }); 
});
sms.addHandler("ota start", (cb) => {    
    // start over the air update checking
    fs.writeFileSync("ota.enable","enable");
    cb("Ota Updates Enabled");
});
sms.addHandler("ota stop", (cb) => {    
    // stop over the air update checking
    fs.writeFileSync("ota.enable","disable");
    cb("Ota Updates Disable");
});
sms.addHandler("restart", (cb) => {    
    // restart
    fs.writeFileSync("restart.enable","enable");
    cb("restart scheduled");
});
sms.addHandler("reboot", (cb) => {    
    // reboot the os on demand
    fs.writeFileSync("reboot.enable","enable");
    cb("reboot scheduled");
});
sms.open().then(() => {
    console.log("Modem Opened");
}).catch(err => {
    console.log("Modem Error",err);
});

