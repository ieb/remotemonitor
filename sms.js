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
    begin(cb) {
        const that = this;
        this.modem = serialportgsm.Modem();
        this.modem.on("error", err => {
            console.log("Error",err);
        });
        this.modem.on("close", closeResult => {
            console.log("Close",closeResult);
        });
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