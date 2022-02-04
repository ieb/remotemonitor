var i2c = require('i2c-bus');

class AM2320 {
    constructor(address, device) {
        this.device = device || '/dev/i2c-1';
        this.address = address || 0x5c;
        this.i2c1 = undefined;

    }
    async begin() {
        console.log("Begin");
        this.i2c1 = await new Promise((resolve, reject) => {
            const _i2c1 = i2c.open(1, err => {
                if (err) {
                    console.log("AM2320 Begin fail ",err);
                    reject(err);
                } else {
                    resolve(_i2c1);
                }
            });
        });
    }

    crc16(data, len)  {
        var crc = 0xFFFF
        for(var x = 0; x < len; x++) {
            crc = crc ^ data[x];
            for ( var bit = 0; bit < 8; bit++ ) {
                if (( crc & 0x0001 ) === 0x0001) {
                    crc >>= 1;
                    crc ^= 0xA001;
                } else {
                    crc >>= 1;
                }
            }
        }
        return crc;
    }
    int16(lsb,msb) {
        var v =  (msb<<8 | lsb); 
        if ( (v & 0x8000) == 0x8000 ) {
            v = -(v&0x7FFF);
        }
        return v;
    }
    uint16(lsb,msb) {
        return  (msb<<8 | lsb); 
    }
    

    async read() {
        const value = await this.readRaw();
        if ( value[0] != 0x03 && value[1] != 0x04 ) {
            console.log("AM2320 Error ", value.toString('hex'));
        }
        const check = this.crc16(value,6);
        const crc = this.uint16(value[6],value[7]);
        if ( crc !== check) {
            console.log("AM2320 CRC fail ",check, crc);
        }
        const humidity = this.uint16( value[3], value[2])/10;
        const temperature = this.int16(value[5], value[4])/10;
        return  {
            humidity:  humidity,
            temperature: temperature
        }
    }
 
    async readRaw() {
        const tnow = process.hrtime();
        var diff = process.hrtime(this.lastUpdate);
        if ( diff[0] >= 2 ) {
            await this.wake(); // wake up
            await this.delay(1);
            await this.writeBytes(0x03, [0x00, 0x04]); 
            await this.delay(1);
            this.lastValue = await this.readBytes(0x00,8);
            this.lastUpdate = process.hrtime();    
        } 
        return this.lastValue;
    }

    delay(tms) {
        return new Promise(function(resolve, reject) {
            setTimeout(resolve, tms);
          });    
    }
    async wake() {
        if ( !this.i2c1 ) {

            await this.begin();
        }
        await new Promise((resolve, reject) => {
            this.i2c1.sendByte(this.address,0x00, (err) => {
                // it will fail as no ACK expected
                resolve();
            })
        }); 
    }
    

    async readBytes(cmd, len) {
        if ( !this.i2c1 ) {
            await this.begin();
        }
        return await new Promise((resolve, reject) => {
                const buffer = Buffer.alloc(len);
                this.i2c1.readI2cBlock(this.address,cmd,len,buffer, (err, readBytes, buffer)  => {
                    if ( err) {
                        console.log("AM2320 readByte Error ",err);
                        reject(err);
                    } else if (readBytes < len) {
                        reject("AM2320 Incomplete got"+readBytes);
                    } else {
                        resolve(buffer)
                    }
                });
            });
    }

    async writeBytes(cmd, arrayBuffer) {
        if ( !this.i2c1 ) {
            await this.begin();
        }
        return await new Promise((resolve, reject) => {
                const buffer = Buffer.from(arrayBuffer);
                this.i2c1.writeI2cBlock(this.address, cmd, buffer.length, buffer, (err, readBytes, buffer)  => {
                    if ( err) {
                        console.log("AM2320 writeBytes Error ",err);
                        reject(err);
                    } else if (readBytes < buffer.length) {
                        reject("Incomplete sent"+readBytes);
                    } else {
                        resolve(readBytes)
                    }
                });
            });
    }
}

if (module === require.main) {
    var tempHumidity = new AM2320();
    setInterval(()=> {
        tempHumidity.read().then((reading) => {
            console.log("Reading",reading);
        }).catch(err => {
            console.log("Error",err);
        });    
    }, 5000);
} else {
    module.exports = AM2320;
}
  
