
const gpsd = require('node-gpsd');
const BME280 = require('./BME280');
const fs = require('fs');
const sensors = require('ds18b20-raspi');  
const config = require("./config");
const {SMS} = require("./sms.js");

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
barometer.begin((err, type) =>{
    if ( err ) {
        console.log("Failed to init BMx280 sensor ",err);
        barometer = undefined;
    } else {
        console.log("Initialised ",type);
    }
});

function updateBME280() {
    try {
        if (barometer) {
            barometer.readPressureAndTemparature((err, pressure, temperature, humidity) => {
                if ( err ) {
                    console.log("Error Reading BMP280 ",err);
                } else {
                    dat.bme280.p = (pressure/100).toFixed(1);
                    dat.bme280.t = temperature.toFixed(1);
                    dat.bme280.h = humidity.toFixed(1);
                }
            });        
        }
    } catch (e) {
        console.log("Failed to read barrometer", e);
    }

}



// Read Temperatures

function updateTemperatures() {
    try {
        sensors.readAllC((err, temps) => {
            if (err) {
                console.log("Error Reading 1 Wire ",err);
            } else {
                for(var i = 0; i < temps.length; i++) {
                  dat.onewire[temps[i].id] = dat.onewire[temps[i].id] || {};
                  dat.onewire[temps[i].id].m = Date.now();
                  dat.onewire[temps[i].id].temp = temps[i].t;
                }
            }
          });
    } catch (e) {
        console.log("Failed reading 1 wire ",e);
    }
}

setInterval(() => {
    updateTemperatures();
    updateBME280();
    console.log(dat);
},60000);


function pad2Zeros(n) {
    return ("00" + n).slice(-2);
}

// LOGFile output

// dump everything out.
setInterval(() => {
    try {
        updateBME280();
        updateTemperatures();
        dat.ts = Date.now();
        var d = new Date();
        var fname = "data/data-"+d.getFullYear()+pad2Zeros(d.getMonth()+1)+pad2Zeros(d.getDate())+".jsonlog";
        fs.appendFile(fname,JSON.stringify(dat)+"\n", (err) => {
            if ( err ) {
                console.log("Failed to write to ", fname);
            }
        });
    } catch (e) {
        console.log("Failed saving data ",e);
    }   
}, 60000);


// SMS Command processing

const sms = new SMS(config);
sms.addHandler("status", () => {    
    updateBME280();
    updateTemperatures();
    return `lat:${dat.pos.lat} lon:${dat.pos.lon} temp:${dat.bme280.t} pressure:${dat.bme280.p} rh:${dat.bme280.h} https://www.google.com/maps/search/?api=1&query=${dat.pos.lat}%2C${dat.pos.lon}`;
});
sms.open((err) => {
    console.log("Modem Errror",err);
});


