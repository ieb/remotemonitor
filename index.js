
const gpsd = require('node-gpsd');
const BME280 = require('./BME280');
const fs = require('fs');
const sensors = require('ds18b20-raspi');  
const config = require("./config");
const { exec } = require('child_process');

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





var barometer = new BME280({address: 0x76});
barometer.begin((err, type) =>{
    if ( err ) {
        console.log("Failed to init BMx280 sensor ",err);
    } else {
        console.log("Initialised ",type);
        setInterval(() => {
            try {
                barometer.readPressureAndTemparature((err, pressure, temperature, humidity) => {
                    if ( err ) {
                        console.log("Error Reading BMP280 ",err);
                    } else {
                        dat.bme280.p = (pressure/100).toFixed(1);
                        dat.bme280.t = temperature.toFixed(1);
                        dat.bme280.h = humidity.toFixed(1);
                    }
                });    
            } catch (e) {
                console.log("Failed to read barrometer", e);
            }
        }, 30000);
    }
});


const inboxDir = '/var/spool/gammu/inbox/';
async function processSMSCommand(date,time,idx,fromNumber,command) {
    console.log(date,time,idx,fromNumber,command);
    if ( command === "status") {
        var status = `lat:${dat.pos.lat} lon:${dat.pos.lon} temp:${dat.bme280.t} pressure:${dat.bme280.p} rh:${dat.bme280.h} https://www.google.com/maps/search/?api=1&query=${dat.pos.lat}%2C${dat.pos.lon}`;
        console.log("Sendign status update to "+fromNumber);
        exec(`gammu-smsd-inject -c /etc/gammu-smsdrc TEXT ${fromNumber} -len ${status.length} -unicode -text "${status}"`,(error, stdout, stderr) => {
            if (error) {
              console.log(`exec error: ${error}`);
              return;
            }
            console.log(`stdout: ${stdout}`);
            console.log(`stderr: ${stderr}`);
          });
    } else {
        console.log("Command not recognised", command);
    }
}

async function processSMSMessageFile(filename) {
    const messageMatch = new RegExp("IN(.*)_(.*)_(.*)_(.*)_(.*)\\.txt", 'gm');
    var m;
    if ((m = messageMatch.exec(filename)) !== null ) {
        console.log("Matched ", filename, m[4]);
        if ( m[4] == config.phone ) {
            var command = fs.readFileSync(inboxDir+filename, "utf-8");
            command = command.trim();
            await processSMSCommand(m[1],m[2],m[3],m[4],command);
        }
    } else {
        console.log("No match for ", filename );
    }
    fs.unlinkSync(inboxDir+filename);
}


var backlog = fs.readdirSync(inboxDir);
backlog.forEach(async (filename) => {
    console.log(`Backlog provided: ${filename}`);
    await processSMSMessageFile(filename);
});

fs.watch('/var/spool/gammu/inbox/', async (eventType, filename) => {
  console.log(`event type is: ${eventType}`);
  if (filename) {
      if ( fs.existsSync(inboxDir+filename)) {
        console.log(`filename provided: ${filename}`);
        await processSMSMessageFile(filename);  
      }
  } else {
    console.log('filename not provided');
  }
});


setInterval(() => {
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
  }, 10000);

setInterval(() => {
    console.log(dat);
},5000);


function pad2Zeros(n) {
    return ("00" + n).slice(-2);
}

// dump everything out.
setInterval(() => {
    try {
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

