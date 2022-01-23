var i2c = require('i2c-bus');

// Also works with BMP280 but returns 0 for humidity since that chip doesnt have humidity

// http://www.adafruit.com/datasheets/BST-BME280-DS001-11.pdf

var BME280 = function(options) {
    options = options || {};
    this.debug = options.debug;
    this.bus = (options.bus===undefined)?1:options.bus;
    this.debug = options.debug || false;
  
    this.address = options.address || BME280.I2C_ADDRESS_A;
};

BME280.prototype.end = function() {
    if ( this.wire ) {
        this.wire.closeSync();
    }
}

BME280.prototype.begin = function(callback) {
    var that = this;
    console.log("BME280 Address is ","0x"+this.address.toString(16));
    this.wire = i2c.open(that.bus, (err) => {
        if ( err ) {
            callback(err);
            return;
        }
        that.wire.writeByte(that.address, BME280.REGISTER_CHIPID, 0, function(err) {
            that.wire.readByte(that.address, BME280.REGISTER_CHIPID, function(err, value) {

                if ( err ) 
                    callback(err);
                else if (value != BME280.CHIP_ID_BMP && value != BME280.CHIP_ID_BME ) 
                    callback(new Error("Chip ID failed, returned " + value));
                else {
                    that.readCoefficients(function(err, cal) {
                        that.calibration = cal;
                        // overscan humidity 1 (IIR)
                        that.wire.writeByte(that.address, BME280.REGISTER_CTRL_HUM, 0x01, function(err) {
                            // overscan temp 1, overscan pressure 4
                            that.wire.writeByte(that.address, BME280.REGISTER_CONTROL, 0x3F, function(err) {
                                callback(err, value === BME280.CHIP_ID_BME?`BME280(decimal ${value}) with Humidity`:`BMP280(decimal ${value}) no Humidity`);
                            });
                        });
                    });
                }
            });       
        });
    });
};

BME280.I2C_ADDRESS_B               = 0x76;
BME280.I2C_ADDRESS_A               = 0x77;
BME280.CHIP_ID_BMP                 = 0x58;
BME280.CHIP_ID_BME                 = 0x60;

BME280.REGISTER_DIG_T1             = 0x88;
BME280.REGISTER_DIG_T2             = 0x8A;
BME280.REGISTER_DIG_T3             = 0x8C;

BME280.REGISTER_DIG_P1             = 0x8E;
BME280.REGISTER_DIG_P2             = 0x90;
BME280.REGISTER_DIG_P3             = 0x92;
BME280.REGISTER_DIG_P4             = 0x94;
BME280.REGISTER_DIG_P5             = 0x96;
BME280.REGISTER_DIG_P6             = 0x98;
BME280.REGISTER_DIG_P7             = 0x9A;
BME280.REGISTER_DIG_P8             = 0x9C;
BME280.REGISTER_DIG_P9             = 0x9E;

BME280.REGISTER_DIG_H1             = 0xA1;
BME280.REGISTER_DIG_H2             = 0xE1;
BME280.REGISTER_DIG_H3             = 0xE2;
BME280.REGISTER_DIG_H4             = 0xE3;
BME280.REGISTER_DIG_H5             = 0xE4;
BME280.REGISTER_DIG_H6             = 0xE5;
BME280.REGISTER_DIG_H7             = 0xE6;
BME280.REGISTER_DIG_H8             = 0xE7;
BME280.REGISTER_DIG_H9             = 0xE8;

BME280.REGISTER_CHIPID             = 0xD0;
BME280.REGISTER_VERSION            = 0xD1;
BME280.REGISTER_SOFTRESET          = 0xE0;

BME280.REGISTER_CAL26              = 0xE1;  // R calibration stored in 0xE1-0xF

BME280.REGISTER_CTRL_HUM           = 0xF2;
BME280.REGISTER_CONTROL            = 0xF4;
BME280.REGISTER_CONFIG             = 0xF5;
BME280.REGISTER_PRESSUREDATA       = 0xF7;
BME280.REGISTER_TEMPDATA           = 0xFA;
BME280.REGISTER_HUMDATA            = 0xFD;


function int12(msb, lsb) {
    var val = msb << 4 | lsb;
    if (val > 32767) val -= 65536;
    return val;
}

function int16(msb, lsb) {
    var val = uint16(msb, lsb); 
    if (val > 32767) val -= 65536;
    return val;
}

function uint16(msb, lsb) {
    return msb << 8 | lsb;
}

function uint20(msb, lsb, xlsb) {
    return ((msb << 8 | lsb) << 8 | xlsb) >> 4;
}

BME280.prototype.readCoefficients = function(callback) {
    var calibration = {};
    var self = this;
    const buffer = Buffer.alloc(24);
    self.wire.readI2cBlock(self.address, BME280.REGISTER_DIG_T1, 24, buffer, function(err, readBytes, buffer) {
        calibration.dig_T1 = uint16( buffer[1], buffer[0] );
        calibration.dig_T2 = int16( buffer[3], buffer[2] );
	    calibration.dig_T3 = int16( buffer[5], buffer[4] );

        calibration.dig_P1 = uint16( buffer[7], buffer[6] );
        calibration.dig_P2 = int16( buffer[9], buffer[8] );
        calibration.dig_P3 = int16( buffer[11], buffer[10] );
        calibration.dig_P4 = int16( buffer[13], buffer[12] );
        calibration.dig_P5 = int16( buffer[15], buffer[14] );
        calibration.dig_P6 = int16( buffer[17], buffer[16] );
        calibration.dig_P7 = int16( buffer[19], buffer[18] );
        calibration.dig_P8 = int16( buffer[21], buffer[20] );
        calibration.dig_P9 = int16( buffer[23], buffer[22] );
        self.wire.readByte(self.address, BME280.REGISTER_DIG_H1, function(err, value) {
            calibration.dig_H1 = int16( 0         , value );
            self.wire.readI2cBlock(self.address, BME280.REGISTER_DIG_H2, 7, buffer, function(err, readBytes, buffer) {
                calibration.dig_H2 = int16( buffer[1], buffer[0] );
                calibration.dig_H3 = int16( 0         , buffer[2] );
                calibration.dig_H4 = int12( buffer[3], (0x0F & buffer[4]));
                calibration.dig_H5 = int12( buffer[5], ((buffer[4] >> 4) & 0x0F));
                calibration.dig_H6 = int16( 0         , buffer[6] );
            });
        });
        callback(err, calibration);
    });
};

BME280.prototype.readPressureAndTemparature = function(callback) {
    var calibration = this.calibration;
    const self = this;

    //read temp and pressure data in one stream;
    const buffer = Buffer.alloc(8);
    this.wire.readI2cBlock(this.address, BME280.REGISTER_PRESSUREDATA, 8, buffer, function(err, readBytes, buffer) {
        var rawPressure = uint20(buffer[0], buffer[1], buffer[2]);
        var rawTemp = uint20(buffer[3], buffer[4], buffer[5]);
        var rawHum  = uint16(buffer[6], buffer[7]);
        
        var t_fine = BME280.compensateTemperature(rawTemp, calibration);
        var pressure = BME280.compensatePressure(rawPressure, t_fine, calibration);
        var temperature = BME280.compensateTemperature2(t_fine, calibration);
        var Humidity = BME280.compensateHumidity(rawHum, t_fine, calibration);
        if ( self.debug ) {
            console.log("Response from chip from registers 0xF7 (pressure), 0xFA (temperature), 0xFD (humidity) ", "0x"+buffer.toString('hex'));
            console.log("Raw Pressure reading as unit16 ",rawPressure);
            console.log("Raw Temperature reading as unit16 ",rawTemp);
            console.log("Raw Humidity reading as unit16 ",rawHum);
            console.log("Calibration: t_fine temperature compensation ",t_fine);
            console.log("Calibration: calibration values from chip register 0x1E ",calibration);
            console.log("Calibrated Pressure: ",pressure);
            console.log("Calibrated temperature: ",temperature);
            console.log("Calibrated Humidity: ",Humidity);
        }
        
        
        callback(null, pressure, temperature, Humidity);
    });
};

// part 1 of temperature compensation
// result is for internal use only
BME280.compensateTemperature = function(adc_T, cal) {
    var var1 = (((adc_T>>3) - (cal.dig_T1<<1)) * cal.dig_T2) >> 11;
    var var2 = (((((adc_T>>4) - (cal.dig_T1)) * ((adc_T>>4) - (cal.dig_T1))) >> 12) * (cal.dig_T3)) >> 14; 
    var t_fine = var1 + var2;
    return t_fine;
};

// part 2 of temperature compensation
//returns temp in degC
BME280.compensateTemperature2 = function(t_fine, cal) {    
    return ((t_fine*5+128)>>8)/100.0;
};

//returns pressure in Pa
BME280.compensatePressure = function(adc_P, t_fine, cal) {
    // via https://raw.githubusercontent.com/SWITCHSCIENCE/BME280/master/Python27/bme280_sample.py
    var var1 = (t_fine >> 1) - 64000;
    var var2 = (((var1 >> 2) * (var1 >> 2)) >> 11) * cal.dig_P6;
    var2 = var2 + ((var1 * cal.dig_P5) << 1);
    var2 = (var2 >> 2) + (cal.dig_P4 << 16);
    var1 = (((cal.dig_P3 * (((var1 >> 2) * (var1 >> 2)) >> 13)) >> 3)  + ((cal.dig_P2 * var1) >> 1)) >> 18;
    var1 = ((32768 + var1) * cal.dig_P1) >> 15;
    
    if (var1 === 0)
        return 0;  // avoid exception caused by division by zero

    var p = ((1048576 - adc_P) - (var2 >> 12)) * 3125;
    if ( p < 0x80000000 ) {
        p = (p * 2.0) / var1;
    }
    else {
        p = (p / var1) * 2;
    }
    var1 = (cal.dig_P9 * (((p / 8.0) * (p / 8.0)) / 8192.0)) / 4096;
    var2 = ((p / 4.0) * cal.dig_P8) / 8192.0;
    p = p + ((var1 + var2 + cal.dig_P7) / 16.0);
    return p;
};

//returns humidity
BME280.compensateHumidity = function(adc_H, h_fine, cal) {
    // via https://raw.githubusercontent.com/SWITCHSCIENCE/BME280/master/Python27/bme280_sample.py
    var var_h = h_fine - 76800;
    if (var_h != 0) {
        var_h = (adc_H - (cal.dig_H4 * 64 + cal.dig_H5 / 16384 * var_h)) * (cal.dig_H2 / 65536 * (1.0 + cal.dig_H6 / 67108864 * var_h * (1.0 + cal.dig_H3 / 67108864 * var_h)));
     }
     else {
         return 0;
     }
     var_h = var_h * (1.0 - cal.dig_H1 * var_h / 524288);
     if (var_h > 100.0) {
         var_h = 100.0;
     }
     else if ( var_h < 0.0) {
        var_h = 0.0
     }
     return var_h;
};

if (module === require.main) {
    var barometer = new BME280({address: 0x76, debug: true});
    barometer.begin((err, type) =>{
        if ( err ) {
            console.log("Failed to init BMx280 sensor ",err);
            barometer = undefined;
        } else {
            console.log("Initialised ",type);
            barometer.readPressureAndTemparature((err, pressure, temperature, humidity) => {
                if ( err ) {
                    console.log("Error Reading BMP280 ",err);
                } else {
                    console.log("Pressure in mbar ",(pressure/100));
                    console.log("Temperature in C",temperature);
                    console.log("Humidity in %RH",humidity);
                    console.log("Date",new Date().toUTCString());
                }
            });
        }
    });

} else {
      module.exports = BME280;
}
  
  
