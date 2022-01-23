const serialportgsm = require('serialport-gsm')

const { exec, spawn } = require('child_process');
const process = require('process');
const path = require('path');

class SMS {
    constructor(config) {
        this.port = config.port;
        this.options = {
            baudRate: 115200,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            rtscts: false,
            xon: false,
            xoff: false,
            xany: false,
            autoDeleteOnReceive: true,
            enableConcatenation: true,
            incomingCallIndication: true,
            incomingSMSIndication: true,
            pin: '',
            customInitCommand: '',
            logger: undefined
        };
        this.allowedFrom = config.allowedFrom;
        this.handler = {};


/*
        this.demoMode = config.demoMode || false;        
        this.state = 0;
        this.message = {};
        this.messagesToProcess = [];
        this.queueIndex = {};
        this.processedIndex = {};
        this.dequeueDelay = config.dequeueDelay || 10000;
        this.checkDelay = config.checkDelay || 30000;
        this.deleteMessageDelay = config.deleteMessageDelay || 5000;
        this.gammuConfig = config.gammuConfig || '/etc/gammu-smsd';
        */

    }

    open(cb) {
        if (this.modem) {
            this.modem.close(() => {
                this.modem = undefined;
                this.begin(cb);
            });
        } else {
            this.begin(cb);
        }
    }
    scheduleReset(message, inms) {
        const that = this;
        if ( this.resetTimeout ) {
            clearTimeout(this.resetTimeout);
            this.resetTimeout = undefined;
        }
        this.resetTimeout = setTimeout(() => {
            console.log(message);
            that.open((err) => {
                console.log("Reset error:",err);
            });
        },inms)
    }
    scheduleHardReset(message, inms) {
        const that = this;
        if ( this.hardResetTimeout ) {
            clearTimeout(this.hardResetTimeout);
            this.hardResetTimeout = undefined;
        }
        this.hardResetTimeout = setTimeout(() => {
            console.log(message);
            that.open((err) => {
                console.log("Reset error:",err);
            });
        },inms)
    }
    begin(cb) {
        const that = this;
        this.modem = serialportgsm.Modem();
        
        this.modem.on("error", err => {
            console.log("Error",err);
        });
        this.modem.on("close", closeResult => {
            console.log("Close",closeResult);
        });
        this.modem.addListener({
            match: (message) => {
               return message.startsWith("^BOOT:"); 
            },
            process: (message) => {
                // console.log("Got Boot",message);
                // if we have lost contact with the modem for more than 5m
                // then reset.
                this.scheduleReset("No Boot heartbeat", 300000);
            }
        });
        this.modem.addListener({
            match: (message) => {
                return message.startsWith("^MODE:") || message.startsWith("^DSFLOWRPT"); 
            },
            process: (message) => {
                if ( message.startsWith("^MODE:5,4")) {
                    console.log("SMS reset in 10s after ppp down");
                    that.scheduleHardReset("ppp down",10000);    
                } else if ( message.startsWith("^MODE:5,")) { 
                    console.log("ppp up");
                } else if ( message.startsWith("^DSFLOWRPT:")) {
                    // ^DSFLOWRPT:0000000E,00003C9E,000004E6,0000000000009906,000000000000537C,00107AC0,00107AC0
                    /*
                    This gives you connection statistics while online, you should receive them every two seconds. The values are all in hexadecimal.
                    n1 is the duration of the connection in seconds
                    n2 is transmit (upload) speed in bytes per second (n2 *8 / 1000 will give you kbps)
                    n3 is receive (download) speed in bytes per second (n3 *8 / 1000 will give you kbps)
                    n4 is the total bytes transmitted during this session
                    n5 is the total bytes transmitted during this session
                    n6 is the negotiated QoS uplink in bytes per second (n2 *8 / 1000 will give you kbps)
                    n7 is the negotiated QoS downlink in bytes per second (n2 *8 / 1000 will give you kbps)
                    Note: n4 and n5 are 64-bit integers, for those >4GB torrent sessions! :)
                    You can reset the connection statistics by sending AT^DSFLOWCLR.
                    */
                    const flrpt = message.substring("^DSFLOWRPT:".length);
                    const flrptFlds = flrpt.split(",");
                    for(var i = 0; i < flrptFlds.length; i++) {
                        flrptFlds[i] = Number("0x"+flrptFlds[i]);
                    }
                    for(var i = 1; i < flrptFlds.length; i++) {
                        flrptFlds[i] = ((flrptFlds[i]*8)/1000).toFixed(0);
                    }
                    console.log(`ppp uptime:${flrptFlds[0]}s ${flrptFlds[1]}/${flrptFlds[1]}kb/s ${flrptFlds[3]}/${flrptFlds[4]*8}kb link:${flrptFlds[6]}/${flrptFlds[4]*8}kb/s `);
                }
            }
        });
        this.scheduleReset("No Boot heartbeat at start", 300000);            
        this.modem.on('onNewMessage', messageDetails =>  {
            console.log("newMessage",messageDetails);
            if (that.allowedFrom[messageDetails.sender]) {
                    const message = messageDetails.message.trim().toLowerCase();
                    if ( that.handler[message]) {
                        that.handler[message]((response) => {
                            that.modem.sendSMS(that.allowedFrom[messageDetails.sender],response, false, (msg, err) => {
                                console.log("Send Message",msg,err);
                            });    
                        });
                    } else {
                        const response = "Expected one of "+Object.keys(that.handler);
                        that.modem.sendSMS(that.allowedFrom[messageDetails.sender],response, false, (msg, err) => {
                            console.log("Sent Help message",msg,err);
                        });
                    }
            } else {
                console.log("Not allowed");
            }
        });
        this.modem.on('onNewMessageIndicator', (sender, timeSent) => { 
            console.log("onNewMessageIndicator",sender,timeSent);

        });
        this.modem.on('onNewIncomingCall', (number, numberScheme) => {  
            console.log("3G: Inbound call from ",number, numberScheme);
            that.modem.hangupCall(() => {
                console.log("3G: Hungup Inbound call from ",number);
            });
        });
        this.modem.on('onMemoryFull', (status, data) => { 
            console.log("Memory Full", status, data);

         });


        this.modem.on('open', () => {
            console.log(`Modem Sucessfully Opened`);
            console.log(`Start Initialise Modem`);
            that.modem.initializeModem((msg,err) => {
                if(err) {
                    console.log(`Failed Initialise modem ${err}`);
                    cb(err);
                } else {
                    console.log(`InitModemResponse: ${JSON.stringify(msg)}`);
                    that.modem.setModemMode((msg,err) => {
                            if(err) {
                                console.log(`Failed to Set Modem Mmode modem ${err}`);
                                cb(err);
                            } else {
                                console.log(`Set Modem Mode Modem Result: ${JSON.stringify(msg)}`);
                                that.modem.checkModem((msg,err) => {
                                        if(err) {
                                            console.log(`Failed to Check modem ${err}`);
                                            cb(err);
                                        } else {
                                            console.log(`Check Modem Result: ${JSON.stringify(msg)}`);
                                            that.modem.checkSimMemory((msg, err) => {
                                                if ( err) {
                                                    console.log(`Failed to Check Sim memory ${err}`);
                                                    cb(err);
                                                } else {
                                                    console.log(`Check Sim Memory Result: ${JSON.stringify(msg)}`);

                                                    that.modem.getSimInbox((result, err) => {
                                                        if(err) {
                                                            console.log(`Failed to get SimInbox ${err}`);
                                                            cb(err);
                                                        } else {
                                                            console.log(`Sim Inbox Result: ${JSON.stringify(result)}`);
                                                            for (var m of result.data) {
                                                                console.log("Deleting ",m);
                                                                this.modem.deleteMessage(m, (msg, err) => {
                                                                    console.log("Deleted",msg,err);
                                                                });
                                                            }        
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    });
                                }
                        }, 'PDU');	
                }
            });
        })
        this.modem.open(this.port, this.options);
    }


    addHandler(command, handler) {
        this.handler[command] = handler;
    }


};

if ( path.basename(process.argv[1]) ==  "sms.js" ) {
    const data = {
        pos: {
            lat: 52.32342,
            lon: 1.234242
        },
        bme280: {
            t: 2.21,
            p: 1024.3,
            h: 45
        }
    };
    const config = require("./config.js");
    const sms = new SMS(config);
    sms.addHandler("status", (cb) => {    
        cb(`lat:${data.pos.lat} lon:${data.pos.lon} temp:${data.bme280.t} pressure:${data.bme280.p} rh:${data.bme280.h} https://www.google.com/maps/search/?api=1&query=${data.pos.lat}%2C${data.pos.lon}`);
    });
    sms.open((err) => {
        console.log("Modem Errror",err);
    });
} else {
    console.log(process.argv);
    module.exports = {
        SMS: SMS
    };
}