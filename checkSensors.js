/*jshint node:true */
"use strict";
/*
 * Copyright 2017 Ian Boston <ianboston@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const BME280 = require('./BME280');


var barometer = new BME280({address: 0x76});

barometer.begin((err, type) =>{
    if ( err ) {
        console.log("Failed to init BMx280 sensor ",err);
    } else {
        console.log("Initialised ",type);
        barometer.readPressureAndTemparature((err, pressure, temperature, humidity) => {
                    if ( err ) {
                        console.log("Error Reading BMP280 ",err);
                    } else {
                        console.log({ pressure, temperature, humidity});
                    }
                });
    }
});
  
