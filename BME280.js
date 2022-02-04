var i2c = require('i2c-bus');

// Also works with BMP280 but returns 0 for humidity since that chip doesnt have humidity



class BME280 {

    // http://www.adafruit.com/datasheets/BST-BME280-DS001-11.pdf
    I2C_ADDRESS_B               = 0x76;
    I2C_ADDRESS_A               = 0x77;
    CHIP_ID_BMP                 = 0x58;
    CHIP_ID_BME                 = 0x60;

    REGISTER_DIG_T1             = 0x88;
    REGISTER_DIG_T2             = 0x8A;
    REGISTER_DIG_T3             = 0x8C;

    REGISTER_DIG_P1             = 0x8E;
    REGISTER_DIG_P2             = 0x90;
    REGISTER_DIG_P3             = 0x92;
    REGISTER_DIG_P4             = 0x94;
    REGISTER_DIG_P5             = 0x96;
    REGISTER_DIG_P6             = 0x98;
    REGISTER_DIG_P7             = 0x9A;
    REGISTER_DIG_P8             = 0x9C;
    REGISTER_DIG_P9             = 0x9E;

    REGISTER_DIG_H1             = 0xA1;
    REGISTER_DIG_H2             = 0xE1;
    REGISTER_DIG_H3             = 0xE2;
    REGISTER_DIG_H4             = 0xE3;
    REGISTER_DIG_H5             = 0xE4;
    REGISTER_DIG_H6             = 0xE5;
    REGISTER_DIG_H7             = 0xE6;
    REGISTER_DIG_H8             = 0xE7;
    REGISTER_DIG_H9             = 0xE8;

    REGISTER_CHIPID             = 0xD0;
    REGISTER_VERSION            = 0xD1;
    REGISTER_SOFTRESET          = 0xE0;

    REGISTER_CAL26              = 0xE1;  // R calibration stored in 0xE1-0xF

    REGISTER_CTRL_HUM           = 0xF2;
    REGISTER_CONTROL            = 0xF4;
    REGISTER_CONFIG             = 0xF5;
    REGISTER_PRESSUREDATA       = 0xF7;
    REGISTER_TEMPDATA           = 0xFA;
    REGISTER_HUMDATA            = 0xFD;

    constructor(options) {
        options = options || {};
        this.debug = options.debug;
        this.bus = (options.bus===undefined)?1:options.bus;
        this.debug = options.debug || false;
      
        this.address = options.address || this.I2C_ADDRESS_A;    
    }
    end() {
        this.opened = false;
        if (this.wire) {
            const w = this.wire;
            this.wire = undefined;
            w.closeSync();
        }
    }
    async begin() {
        const that = this;
        if ( !this.opened ) {
            this.wire = await new Promise((resolve, reject) => {
                const w = i2c.open(that.bus, (err) => {
                    if ( err ) {
                        console.log("BME280 open Error ",err);
                        reject(err);
                    } else {
                        resolve(w);
                    }
                });
            });
            try {
                await this.writeByte(this.REGISTER_CHIPID, 0);
            } catch (e) {
                // ignore a fail here, the chip may not ack
                console.log("BME280 Chip ID Wake up erro ",e);
            }
            const chipId = await this.readByte(this.REGISTER_CHIPID);
            if (chipId != this.CHIP_ID_BMP && chipId != this.CHIP_ID_BME ) {
                throw new Error("BME280 Chip ID failed, returned " + chipId);
            }
            this.calibration = await this.readCoefficients();
            // overscan humidity 1 (IIR)
            await this.writeByte(this.REGISTER_CTRL_HUM, 0x01);
            // overscan temp 1, overscan pressure 4
            await this.writeByte(this.REGISTER_CONTROL, 0x3F);
            this.opened = true;
            if ( chipId == this.CHIP_ID_BME) {
                return `BME280(decimal ${chipId}) with Humidity`;
            } else {
                return `BMP280(decimal ${chipId}) no Humidity`
            }    
        }
        return "AlreadyOpen;"
    }

    async readPressureAndTemparature() {
        var calibration = this.calibration;
    
        //read temp and pressure data in one stream;
        const buffer = await this.readBlock(this.REGISTER_PRESSUREDATA, 8);
        const rawPressure = this.uint20(buffer[0], buffer[1], buffer[2]);
        const rawTemp = this.uint20(buffer[3], buffer[4], buffer[5]);
        const rawHum  = this.uint16(buffer[6], buffer[7]);
            
        const t_fine = this.compensateTemperature(rawTemp, calibration);
        const pressure = this.compensatePressure(rawPressure, t_fine, calibration);
        const temperature = this.compensateTemperature2(t_fine, calibration);
        const humidity = this.compensateHumidity(rawHum, t_fine, calibration);
        if ( this.debug ) {
            console.log("Response from chip from registers 0xF7 (pressure), 0xFA (temperature), 0xFD (humidity) ", "0x"+buffer.toString('hex'));
            console.log("Raw Pressure reading as unit16 ",rawPressure);
            console.log("Raw Temperature reading as unit16 ",rawTemp);
            console.log("Raw Humidity reading as unit16 ",rawHum);
            console.log("Calibration: t_fine temperature compensation ",t_fine);
            console.log("Calibration: calibration values from chip register 0x1E ",calibration);
            console.log("Calibrated Pressure: ",pressure);
            console.log("Calibrated temperature: ",temperature);
            console.log("Calibrated Humidity: ",humidity);
        }
            
        return {
            pressure,
            temperature,
            humidity
        };
    }
    

    // part 1 of temperature compensation
    // result is for internal use only
    compensateTemperature(adc_T) {
        var var1 = (((adc_T>>3) - (this.calibration.dig_T1<<1)) * this.calibration.dig_T2) >> 11;
        var var2 = (((((adc_T>>4) - (this.calibration.dig_T1)) * ((adc_T>>4) - (this.calibration.dig_T1))) >> 12) * (this.calibration.dig_T3)) >> 14; 
        var t_fine = var1 + var2;
        return t_fine;
    }

    // part 2 of temperature compensation
    //returns temp in degC
    compensateTemperature2 = function(t_fine) {    
        return ((t_fine*5+128)>>8)/100.0;
    }

    //returns pressure in Pa
    compensatePressure(adc_P, t_fine) {
        // via https://raw.githubusercontent.com/SWITCHSCIENCE/BME280/master/Python27/bme280_sample.py
        var var1 = (t_fine >> 1) - 64000;
        var var2 = (((var1 >> 2) * (var1 >> 2)) >> 11) * this.calibration.dig_P6;
        var2 = var2 + ((var1 * this.calibration.dig_P5) << 1);
        var2 = (var2 >> 2) + (this.calibration.dig_P4 << 16);
        var1 = (((this.calibration.dig_P3 * (((var1 >> 2) * (var1 >> 2)) >> 13)) >> 3)  + ((this.calibration.dig_P2 * var1) >> 1)) >> 18;
        var1 = ((32768 + var1) * this.calibration.dig_P1) >> 15;
        
        if (var1 === 0)
            return 0;  // avoid exception caused by division by zero

        var p = ((1048576 - adc_P) - (var2 >> 12)) * 3125;
        if ( p < 0x80000000 ) {
            p = (p * 2.0) / var1;
        }
        else {
            p = (p / var1) * 2;
        }
        var1 = (this.calibration.dig_P9 * (((p / 8.0) * (p / 8.0)) / 8192.0)) / 4096;
        var2 = ((p / 4.0) * this.calibration.dig_P8) / 8192.0;
        p = p + ((var1 + var2 + this.calibration.dig_P7) / 16.0);
        return p;
    }

    //returns humidity
    compensateHumidity(adc_H, h_fine) {
        // via https://raw.githubusercontent.com/SWITCHSCIENCE/BME280/master/Python27/bme280_sample.py
        var var_h = h_fine - 76800;
        if (var_h != 0) {
            var_h = (adc_H - (this.calibration.dig_H4 * 64 + this.calibration.dig_H5 / 16384 * var_h)) * (this.calibration.dig_H2 / 65536 * (1.0 + this.calibration.dig_H6 / 67108864 * var_h * (1.0 + this.calibration.dig_H3 / 67108864 * var_h)));
        }
        else {
            return 0;
        }
        var_h = var_h * (1.0 - this.calibration.dig_H1 * var_h / 524288);
        if (var_h > 100.0) {
            var_h = 100.0;
        }
        else if ( var_h < 0.0) {
            var_h = 0.0
        }
        return var_h;
    }


    async readCoefficients() {
        var calibration = {};        
        const buffer = await this.readBlock(this.REGISTER_DIG_T1, 24);
        calibration.dig_T1 = this.uint16( buffer[1], buffer[0] );
        calibration.dig_T2 = this.int16( buffer[3], buffer[2] );
        calibration.dig_T3 = this.int16( buffer[5], buffer[4] );

        calibration.dig_P1 = this.uint16( buffer[7], buffer[6] );
        calibration.dig_P2 = this.int16( buffer[9], buffer[8] );
        calibration.dig_P3 = this.int16( buffer[11], buffer[10] );
        calibration.dig_P4 = this.int16( buffer[13], buffer[12] );
        calibration.dig_P5 = this.int16( buffer[15], buffer[14] );
        calibration.dig_P6 = this.int16( buffer[17], buffer[16] );
        calibration.dig_P7 = this.int16( buffer[19], buffer[18] );
        calibration.dig_P8 = this.int16( buffer[21], buffer[20] );
        calibration.dig_P9 = this.int16( buffer[23], buffer[22] );
        const h1 = await this.readByte(this.REGISTER_DIG_H1);
        calibration.dig_H1 = this.int16( 0         , h1 );
        const hbuffer = await this.readBlock(this.REGISTER_DIG_H2, 7);
        calibration.dig_H2 = this.int16( hbuffer[1], hbuffer[0] );
        calibration.dig_H3 = this.int16( 0         , hbuffer[2] );
        calibration.dig_H4 = this.int12( hbuffer[3], (0x0F & hbuffer[4]));
        calibration.dig_H5 = this.int12( hbuffer[5], ((hbuffer[4] >> 4) & 0x0F));
        calibration.dig_H6 = this.int16( 0         , hbuffer[6] );
        return calibration;
    }

    readBlock(register, len) {
        const that = this;
        return new Promise((resolve, reject) => {
            const buffer = Buffer.alloc(len);
            that.wire.readI2cBlock(that.address, register, len, buffer, function(err, readBytes, buffer) {
                if (err) {
                    console.log("BME280 readBlock error ",err);
                    reject(err);
                } else if ( len !== readBytes ) {
                    reject("Incomplete read ",len,readBytes);
                } else {
                    resolve(buffer);
                }
            });
        });
    }

    writeByte(register,b) {
        const that = this;
        return new Promise((resolve, reject) => {
            that.wire.writeByte(that.address, register, b, function(err) {
                if (err) {
                    console.log("BME280 writeByte error ",err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    readByte(register) {
        const that = this;
        return new Promise((resolve, reject) => {
            that.wire.readByte(that.address, register, function(err, value) {
                if (err) {
                    console.log("BME280 readByte error ",err);
                    reject(err);
                } else {
                    resolve(value);
                }
            });
        });
    }

    int12(msb, lsb) {
        var val = msb << 4 | lsb;
        if (val > 32767) val -= 65536;
        return val;
    }
    
    int16(msb, lsb) {
        var val = this.uint16(msb, lsb); 
        if (val > 32767) val -= 65536;
        return val;
    }
    
    uint16(msb, lsb) {
        return msb << 8 | lsb;
    }
    
    uint20(msb, lsb, xlsb) {
        return ((msb << 8 | lsb) << 8 | xlsb) >> 4;
    }
    

}



if (module === require.main) {
    async function testBME280() {
        var barometer = new BME280({address: 0x76, debug: true});
        const type = await barometer.begin();
        console.log("Initialised ",type);
        const readings = await barometer.readPressureAndTemparature();
        console.log("Pressure in mbar ",(readings.pressure/100));
        console.log("Temperature in C",readings.temperature);
        console.log("Humidity in %RH",readings.humidity);
        console.log("Date",new Date().toUTCString());
    }
    testBME280().then(() => {
        console.log("Done");
    }).catch((err) => {
        console.log("Error",err);
    });

} else {
      module.exports = BME280;
}
  
  
