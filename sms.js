
const { exec, spawn } = require('child_process');
const process = require('process');
const path = require('path');

class SMS {
    constructor(config) {
        this.demoMode = config.demoMode || false;        
        this.state = 0;
        this.message = {};
        this.allowedFrom = config.allowedFrom;
        this.processSMS = this.processSMS.bind(this);
        this.dequeueMessage = this.dequeueMessage.bind(this);
        this.deleteMessage = this.deleteMessage.bind(this);
        this.messagesToProcess = [];
        this.queueIndex = {};
        this.processedIndex = {};
        this.handler = {};
        this.dequeueDelay = config.dequeueDelay || 10000;
        this.checkDelay = config.checkDelay || 30000;
        this.deleteMessageDelay = config.deleteMessageDelay || 5000;
        this.gammuConfig = config.gammuConfig || '/etc/gammu-smsd';
        this.dequeueMessage();
        this.deleteMessage();

    }


    addHandler(command, handler) {
        this.handler[command] = handler;
    }

    processSMS() {
        const that = this;
        this.state = 0;
        this.message = {};
        var getsms = undefined;
        if ( this.demoMode ) {
            getsms = spawn("cat", ["testsms.txt"]/*gammu",["-c","/etc/gammu-smsdrc","getallsms","-pbk"]*/);            
        } else {
            getsms = spawn("gammu",["-c",this.gammuConfig,"getallsms","-pbk"]);            
        }
        var buffer = "";
        getsms.stdout.on('data', (data) => {
            buffer = that.processData(buffer, data.toString());
        });       
        getsms.stderr.on('data', (data) => {
            console.log("gammuu getallsms stderr",error);
        });       
        getsms.on('error', (error) => {
            console.log("gammuu getallsms error",error);
        });
        getsms.on('close', (code) => {
            if ( code != 0) {
                console.log("gammuu getall sms non zero exit",code);
            }
            that.processData(buffer,"\n ");
            console.log("Processing inbox complete");
            setTimeout(that.processSMS, that.checkDelay);
        });
    }

    processData(buffer, data) {
        buffer = buffer + data;
        const lines = buffer.split("\n");
        for(var i = 0; i < lines.length-1; i++) {
            this.processLine(lines[i]);
        }
        return lines[lines.length-1];
    }

    processLine(line) {
        line = line.trim();
        switch(this.state) {
            case 0:
                if (line.startsWith("Location ")) {
                    this.message.location = this.parseLocation(line);
                    this.state = 1;
                }
                break;
            case 1: // headers
                if ( line.length == 0) {
                    this.state = 2; // message
                    this.message.body = "";
                } else if ( line == "Empty" ) {
                    this.enqueueMessage(this.message);
                    this.state = 0; // next location.
                } else if ( line.startsWith("SMSC number")) {
                    this.message.smsc = this.parseHeader(line);
                } else if ( line.startsWith("Sent")) {
                    this.message.dateSent = this.parseHeader(line);
                } else if ( line.startsWith("Coding")) {
                    this.message.coding = this.parseHeader(line);
                } else if ( line.startsWith("Remote number")) {
                    this.message.from = this.parseHeader(line);
                } else if ( line.startsWith("Status")) {
                    this.message.status = this.parseHeader(line);
                } else if (line.startsWith("Location ")) {
                    this.message.location = this.parseLocation(line);
                    this.message.body = "";
                    this.enqueueMessage(this.message);
                    this.message = {};
                }
                break;
            case 2:
                if ( line.length == 0 ) {
                    this.message.body = this.message.body.trim();
                    this.enqueueMessage(this.message);
                    this.message = {};
                    this.state = 0;
                } else if (line.startsWith("Location ")) {
                    // new location, save what we have
                    this.message.body = this.message.body.trim();
                    this.enqueueMessage(this.message);
                    this.message = {};
                    this.message.location = this.parseLocation(line);
                    this.state = 1;
                } else {
                    this.message.body = this.message.body+line;
                }
                break;
        }
    }

    parseLocation(line) {
        line = line.split(",");
        return line[0].slice("Location ".length);
    }

    parseHeader(line) {
        line = line || "";
        const parts = line.split(":");
        parts.shift();
        const value = parts.join(':').trim();
        if ( value.startsWith('"') ) {
            return value.replaceAll('"',"");
        }
        return value;
    }

    enqueueMessage(message) {
        if(this.allowedFrom[message.from]) {
            if ( this.messagesToProcess.length > 20) {
                console.log("Dropping Message, queue full ", message, this.messagesToProcess.length);
            } else {
                console.log("Queing message",  this.messagesToProcess.length, message);
                this.pushQueue(JSON.parse(JSON.stringify(message)));    
            }
        } else {
            console.log("Dropped ", message);
        }
    }

    pushQueue(message) {
        const messageKey = message.from+","+message.dateSent;
        if ( this.queueIndex[messageKey] ) {
            console.log("Duplicated Message not added to queue ",this.message);
            
        } else if (this.processedIndex[messageKey]) {
            console.log("Duplicated Processed Message not added to queue ",this.message);
        } else {
            this.queueIndex[messageKey] = message;
            this.messagesToProcess.push(message);
            message.ts = new Date(message.dateSent).getTime();
            console.log("Queue Now",this.messagesToProcess.length);    
        }
        // save the queue
    }
    popQueue() {
        const message = this.messagesToProcess.shift();
        const messageKey = message.from+","+message.dateSent;
        delete this.queueIndex[messageKey];
        console.log(JSON.stringify(this.messagesToProcess));
        // save the queue;
        return message;
    }
    processed(message) {
        const messageKey = message.from+","+message.dateSent;
        this.processedIndex[messageKey] = message;
        var keys = Object.keys(this.processedIndex);
        if ( keys.length === 0 ) {
            
        }
        keys.sort((a,b) => {
            return this.processedIndex[a].ts - this.processedIndex[b].ts; 
        });
        console.log("Processed record size ",keys.length," since ",this.processedIndex[keys[0]].dateSent);
        if ( keys.length > 50) {
            // remove the oldest 10, by sorting the timestamps and removing the fist 10 keys after sorting.
            
            for (var i = 0; i < 10; i++) {
                delete this.processedIndex[keys[i]];
            }
        }

    }
    loadQueue() {

    }

    // dequeue and process a single message from the queue.
    // if it fails place it back on the queue 
    // if it suceeds place it on the processed message map.
    dequeueMessage() {
        var that = this;
        if ( this.messagesToProcess.length > 0) {
            const message = this.popQueue();
            message.retries = message.retries || 0;
            if ( this.handler[message.body]) {
                this.handler[message.body](message, (response) => {
                    if ( response.requeue) {
                        console.log("Dequeue: requeue ",message);
                        message.requeue++;
                        that.pushQueue(message);
                    } else if ( response.message && response.to ) {
                        var sendsms = undefined;
                        if (that.demoMode) {
                            sendsms = spawn("cat");

                        } else {
                            sendsms = spawn('gammu',['-c',that.gammuConfig,'--sendsms','TEXT',response.to]);
                        }
                        if (that.demo)
                        sendsms.stdout.on('data', (data) => {
                            console.log("sensms stdout:",data.toString());
                        });
                            
                        sendsms.stderr.on('data', (data) => {
                            console.error(`sendsms stderr: ${data}`);
                        });       
                        sendsms.on('error', (error) => {
                            // add a retry to the message, dont deleted
                        });
                        sendsms.on('close', (code) => {
                            // delete the message and mark as done.
                            if ( code != 0) {
                                message.retries++;
                                if ( message.retries < 5) {
                                    console.log("Dequeue: retrying ",message);
                                    that.pushQueue(message);
                                } else {
                                    that.processed(message);
                                    console.log("Dequeue: Failed to handle ",message);
                                }
                            } else {
                                that.processed(message);
                                console.log("Dequeue: Handled ",message, response);
                            }
                        });
                        sendsms.stdin.write(response.message);
                        sendsms.stdin.end();    
                    } else {
                        that.processed(message);
                        console.log("Dequeue: Handled no response ",message);
                    }
                });
            } else {
                that.processed(message);
                console.log("Dequeue: No handler for ",message);
            }    
        } else {
            console.log("Dequeue: No messages to process");
        }
        setTimeout(this.dequeueMessage, this.dequeueDelay);      
        
    }

    /**
     * delete the oldest message from the inbox and mark as deleted in the store.
     */
    deleteMessage() {
        var that = this;
        var keys = Object.keys(this.processedIndex);
        keys.sort((a,b) => {
            return this.processedIndex[a].ts - this.processedIndex[b].ts; 
        });

        for (var k of keys ) {
            var m = this.processedIndex[k];
            if ( !m.inboxDeleted ) {
                var cmd = undefined;
                if ( this.demoMode) {
                    cmd = `echo delete messages ${m.location} `;
                } else {
                    cmd = `gammu -c ${this.gammuConfig} deletesms 1 ${m.location}`;
                }
                exec(cmd, (error, stdout, stderr) => {
                    if ( !error) {
                        m.inboxDeleted = true;
                    }
                    console.log("delete message Error ", error);
                    console.log("delete message Stdout: ", stdout);
                    console.log("delete message stderr: ", stderr);
                });
                break;
            }
        }
        setTimeout(that.deleteMessage, this.deleteMessageDelay);
    }
};

if ( path.basename(process.argv[1]) ==  "sms.js" ) {

    const sms = new SMS({
        dequeueDelay: 10000,
        checkDelay: 30000,
        demoMode: true,
        allowedFrom: {
            "+44123123123": true
        }
    });
    sms.addHandler("status", (message, cb) => {    
        cb({
            message: `lat:${data.pos.lat} lon:${data.pos.lon} temp:${data.bme280.t} pressure:${data.bme280.p} rh:${data.bme280.h} https://www.google.com/maps/search/?api=1&query=${this.data.pos.lat}%2C${this.data.pos.lon}`,
            to: message.from
        });
    });
    sms.addHandler("Status", (message, cb) => {    
        message.requeue = message.requeue || 0;
        if (message.requeue < 3) {
            cb({
                requeue: true
            });
        } else {
            console.log("Got Status");
            cb({
                message: `All Ok`,
                to: message.from
            });    
        }
    });


    sms.processSMS();

} else {
    console.log(process.argv);
    module.exports = {
        SMS: SMS
    };
}