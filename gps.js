'use strict';

// Although this works it uses 78% CPU at 4800 on a very simple NMEA stream whereas gpsd uses 15% CPU, 
// So not using this.
// here for posteiry.


const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');


/*
.1,N,0000.2,K,A*1B
Datum
(41) $GPDTM,W84,,00.0000,N,00.0000,W,,W84*53
Fix
(76) $GPGGA,085652,5211.2821,N,00007.2285,E,1,03,05.53,000017.8,M,0046.5,M,,*73
Date time
(36) $GPZDA,085653,26,05,2002,+00,00*6F
Stalite data
(70) $GPGSV,3,1,11,02,21,226,43,05,56,291,43,07,56,069,31,09,19,088,29*73
(70) $GPGSV,3,2,11,11,22,214,39,13,35,266,48,14,12,149,29,15,06,275,31*7E
(57) $GPGSV,3,3,11,18,07,334,29,20,68,225,29,30,72,137,27*4C
SOG/COG

(46) $GPVTG,175.8,T,178.6,M,000.2,N,0000.4,K,A*16
(41) $GPDTM,W84,,00.0000,N,00.0000,W,,W84*53
(76) $GPGGA,085653,5211.2822,N,00007.2284,E,1,03,05.53,000017.8,M,0046.5,M,,*70
(36) $GPZDA,085654,26,05,2002,+00,00*68
(70) $GPGSV,3,1,11,02,21,226,43,05,56,291,43,07,56,069,29,09,19,088,31*73
(70) $GPGSV,3,2,11,11,22,214,42,13,35,266,47,14,12,149,31,15,06,275,31*74
(57) $GPGSV,3,3,11,18,07,334,27,20,68,225,29,30,72,137,27*42
(46) $GPVTG,180.9,T,183.7,M,000.2,N,0000.4,K,A*18
(41) $GPDTM,W84,,00.0000,N,00.0000,W,,W84*53
(76) $GPGGA,085654,5211.2823,N,00007.2282,
*/

const detectSentenceRE = /^\$(.*)\*(.*)$/gm;
const dtmRE = /^\$.{2}DTM,(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*)\*(.*)$/gm;
const zdaRE = /^\$.{2}ZDA,(.*),(.*),(.*),(.*),(.*),(.*)\*(.*)$/gm;
const vtgRE = /^\$.{2}VTG,(.*),(.*),(.*),(.*),(.*),(.*)\*(.*)$/gm;
const gsvRE = /^\$.{2}GSV,(.*)\*(.*)$/gm;
const ggaRE = /^\$.{2}GGA,(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*),(.*)\*(.*)$/gm;

function toNumber(v) {
    if (v == null) {
        return 0;
    } 
    return +v;
}
function toDistance(v,u) {
    v = toNumber(v);
    if ( u === "M" ) {
        return v;
    } else {
        console.log("Distance units not recognised ",u);
        return v;
    }
}

function toPossition(p,nsew) {
    const parts = p.split(".");
    const degrees = +(parts[0].slice(0,-2));
    const minsec = +(parts[0].slice(-2)+"."+parts[1]);
    const pos = degrees + minsec/60;
    if ( "SsWw".indexOf(nsew) >= 0 ) {
        return -pos;
    }
    return pos;
}

class GPS {
    constructor(device, speed) {
        var that = this;
        this.port = new SerialPort(device, {
            baudRate: speed
          });
        this.parser = this.port.pipe(new Readline({ delimiter: '\r\n' }));
        this.parser.on('data', (line) => {
            if (that.checkSumOk(line)) {
                for( var sentence of that.sentences ) {
                    if (sentence(line)) {
                        break;
                    }
                }
            } 
        });
        this.sentenceGGA = this.sentenceGGA.bind(this);
        this.sentenceZDA = this.sentenceZDA.bind(this);
        this.sentenceDropped = this.sentenceDropped.bind(this);
        this.sentences = [
            this.sentenceGGA,
            this.sentenceZDA,
            this.sentenceDropped
        ];
        this.fix = {};
    }

    checkSumOk(line) {
        let m = detectSentenceRE.exec(line);
        if ( m !== null) {
            var sentence = m[1];
            var checksum = m[2];
            var c = sentence.charCodeAt(0);
            for (var i = 1; i < sentence.length; i++) {
                c = c ^ sentence.charCodeAt(i);
            }
            var cs = c.toString(16).toUpperCase();
            if ( cs == checksum ) {
                return true;
            } else {
                console.log("Bad CS",line,cs);
            }
        }
        return false;
    };


    /*
    From SignalK NMEA
      GGA - Time, position, and fix related data
  This is one of the sentences commonly emitted by GPS units.
  0      1        2             3 4              5 6 7 8   9     10 11     12 13  14
  |      |        |             | |              | | | |   |      | |       | |   |     
  $GPGGA,172814.0,3723.46587704,N,12202.26957864,W,2,6,1.2,18.893,M,-25.669,M,2.0,0031*hh<CR><LF>
  Field Number:
  0	Message ID $GPGGA
  1	UTC of position fix
  2	Latitude
  3	Direction of latitude: N (north) or S (south)
  4	Longitude
  5	Direction of longitude: E (east) or W (west) 
  6	GPS Quality indicator: 0 = Fix not valid; 1 = GPS fix; 2 = Differential GPS fix, OmniSTAR VBS; 4 = Real-Time Kinematic, fixed integers; 5 = Real-Time Kinematic, float integers, OmniSTAR XP/HP or Location RTK
  7	Number of SVs in use, range from 00 through to 24+
  8	HDOP
  9	Orthometric height (MSL reference)
  10 M: unit of measure for orthometric height is meters
  11 Geoid separation
  12 M: geoid separation measured in meters
  13 Age of differential GPS data record, Type 1 or Type 9. Null field when DGPS is not used.
  14 Reference station ID, range 0000-4095. A null field when any reference station ID is selected and no corrections are received
*/
/*
  From USB unit, note field 1 is odd.
      // (76) $GPGGA,085652,5211.2821,N,00007.2285,E,1,03,05.53,000017.8,M,0046.5,M,,*73

  */

    sentenceGGA(line) {
        let m = ggaRE.exec(line);
        if ( m !== null ) {
            const t = m[1] || "";
            const hours = t.slice(0,2);
            const minutes = t.slice(2,4);
            const seconds = t.slice(4,6);
            const milliseconds = (t.slice(4) % 1) * 1000;
            const dt = new Date();
            const year = dt.getUTCFullYear();
            const month = dt.getUTCMonth();
            const day = dt.getUTCDate();
            this.fix.fixTime =  new Date(Date.UTC(year, (month - 1), day, hours, minutes, seconds, milliseconds));
            this.fix.latitude = toPossition(m[2], m[3]);
            this.fix.longitude = toPossition(m[4],m[5]);
            this.fix.fixQuality = toNumber(m[6]);
            this.fix.satelitesUser = toNumber(m[7]);
            this.fix.hdop = toNumber(m[8]);
            this.fix.height = toDistance(m[9],m[10]);
            this.fix.geoidSeperation = toDistance(m[11],m[12]);
            this.fix.differentialAge = toNumber(m[13]);
            this.fix.differentialStation = m[14];
            console.log("Fix ", line, this.fix);
            return true;
        }
        return false;
    }

    /*
UTC time and date:
$IIZDA,hhmmss.ss,xx,xx,xxxx,,*hh
 I I I I_Year
 I I I_Month
 I I_Day
 I_Time

 (36) $GPZDA,085654,26,05,2002,+00,00*68

 */

    sentenceZDA(line) {
        let m = zdaRE.exec(line);
        if ( m !== null ) {
            const t = m[1] || '';
            const hour = t.slice(0,2);
            const minutes = t.slice(2,4);
            const seconds = t.slice(4,6);
            const milliseconds = (t.slice(4) % 1) * 1000;
            const day = +m[2];
            const month = +m[3]-1;
            const year = +m[4];
            this.time = new Date(Date.UTC(year,month,day,hour,minutes,seconds,milliseconds));
            console.log("time ", line, this.time);
            return true;
        }
        return false;
    }

    sentenceDropped(line) {
        console.log("Dropped ", line);
    }



}

const gps = new GPS("/dev/serial/by-id/usb-067b_2303-if00-port0",4800);
