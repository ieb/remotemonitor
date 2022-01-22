'use strict';
const googleDrive = require('@googleapis/drive');
const path = require('path');
const {createHash} = require('crypto');
const { createGzip } = require('zlib');
const { readdirSync, statSync, createReadStream, createWriteStream, readFileSync, existsSync, fstat, writeFileSync } = require('fs');
const { promisify } = require('util');
const { pipeline } = require('stream');
const pipe = promisify(pipeline);

class Drive {
    constructor(keys) {
        this.auth = new googleDrive.auth.GoogleAuth({
            keyFile: keys,
            scopes: 'https://www.googleapis.com/auth/drive',
        });
    }

    async compress(sourceFolder, extension) {
        const dataDir = readdirSync(sourceFolder);
        for (const file of dataDir) {
            if ( file.endsWith(extension)) {
                const filePath = path.join(sourceFolder,file);
                const fileStat = statSync(filePath);
                if ( fileStat.isFile() ) {
                    const gzFile = path.join(sourceFolder,file+".gz");
                    var gzStat;
                    var compress = false;
                    if ( existsSync(gzFile)) {
                        gzStat = statSync(gzFile);
                        if (gzStat.mtimeMs < fileStat.mtimeMs ) {
                            console.log("Updated",filePath);
                            compress = true;
                        }
                    } else {
                        console.log("New File",filePath);
                        compress = true;
                    }
                    if ( compress  ) {
                        const gzip = createGzip();
                        const source = createReadStream(filePath);
                        const destination = createWriteStream(gzFile);
                        await pipe(source, gzip, destination);
                    }                        
                }
            }
        }
    }
    async syncWithCompression(sourceFolder, destinationContainer, extension) {
        await this.compress(sourceFolder, extension);
        return await this.sync(sourceFolder, destinationContainer, extension+".gz");
    }

    doMd5(filePath) {
        const content = readFileSync(filePath);
        const hash = createHash('md5');
        hash.update(content);
        return hash.digest().toString("hex");
    }

    async sync(sourceFolder, destinationContainer, extension, commandFile) {
        console.log("Drive: Started Sync");
        const client = await this.auth.getClient();
                
        // Obtain a new drive client, making sure you pass along the auth client
        const drive = googleDrive.drive({
            version: 'v3',
            auth: client,
        });
        const folderList = await drive.files.list({ 
            q: "mimeType = 'application/vnd.google-apps.folder'"
          });
        var parentContainer = undefined;
        for (var d of folderList.data.files) {
            if ( d.name === destinationContainer) {
              parentContainer = d;
              break;
            }
        }
        if ( !destinationContainer) {
            console.log("No destincation container found ");
            return false;
        }
        const res = await drive.files.list({
            q: ` '${parentContainer.id}' in parents `,
            fields: 'files(id, name, md5Checksum, size)'
        });
        const existingFiles = {};
        for (var f of res.data.files ) {
            existingFiles[f.name] = f;
        }

        // process files
        const dataDir = readdirSync(sourceFolder);
        for (const file of dataDir) {
            if ( file.endsWith(extension)) {
                const filePath = path.join(sourceFolder,file);
                const fileStat = statSync(filePath);
                if ( fileStat.isFile() ) {
                    if ( existingFiles[file] ) {
                        const driveFile = existingFiles[file];
                        const md5 =  this.doMd5(filePath);
                        if (driveFile.md5Checksum == undefined ) {
                            console.log(`Not a normal file, no action ${file}  ${md5} ${fileStat.size} `);
                        } else if ( driveFile.md5Checksum != md5 ) {
                            console.log(`Changed ${file} ${driveFile.md5Checksum} != ${md5} ${driveFile.size} ?= ${fileStat.size} `);
                            await this.updateFile(drive, fileStat, filePath, file, driveFile);
                        } else {
                            console.log(`No Change ${file} ${driveFile.md5Checksum} == ${md5} ${driveFile.size} == ${fileStat.size} `);
                        }
                    } else {
                        console.log(`New ${file}  `);
                        await this.createFile(drive, fileStat, filePath, file, parentContainer);
                    }
                }
            }
        }
        var exitCode = 0;
        if ( commandFile && existingFiles[commandFile] ) {
            const driveFile = existingFiles[commandFile];
            const filePath = path.join(sourceFolder, commandFile);
            const processedPath = path.join(sourceFolder, "processed-"+commandFile);
            var download = true;
            if ( existsSync(filePath) ) {
                const md5 =  this.doMd5(filePath);
                if ( driveFile.md5Checksum == md5 ) {
                    download = false;
                }
            }
            if ( download ) {
                console.log("New command file");
                await this.downloadFile(drive, driveFile, filePath);
            }
            var processCommand = true;
            if ( existsSync(processedPath) ) {
                const md5 = this.doMd5(processedPath);
                if ( driveFile.md5Checksum == md5  ) {
                    processCommand = false;
                }
            }
            if (processCommand ) {
                console.log("Processing new command file");
                const command = JSON.parse(readFileSync(filePath, {encoding:"utf-8"}));
                // for the moment we return an status and let the wrapper deal with it.
                exitCode = command.code;
                writeFileSync(processedPath,readFileSync(filePath));
            }
        } else {
            console.log("No Command file");
        }
        console.log("Sync Done ",new Date());
        return exitCode;
    }

    async downloadFile(drive, driveFile, filePath) {          
        var dest = fs.createWriteStream(filePath);
        await drive.files.get({
            fileId: driveFile.id,
            alt: 'media'
            }).on("data",d => {
                progress += d.length;
                console.log(`Downloaded ${progress} bytes`);
            }).pipe(dest);
    }


    async updateFile(drive, fileStat, filePath, fileName, driveFile) {
        const fileSize = fileStat.size;
        const resource = {
            name: fileName,
            fields: 'id, parents'
        };
        const res = await drive.files.update({
            fileId: driveFile.id,
            resource: resource,
            media: {
                body: createReadStream(filePath),
            }
          },
          {
            // Use the `onUploadProgress` event from Axios to track the
            // number of bytes uploaded to this point.
            onUploadProgress: evt => {
              const progress = (evt.bytesRead / fileSize) * 100;
              console.log(`${Math.round(progress)}% complete`);
            },
          }
        );
        console.log("Updated ",res.data.id);
    }
    
    
    async createFile(drive, fileStat, filePath, fileName, container) {
        const fileSize = fileStat.size;
        const resource = {
            name: fileName,
            fields: 'id, parents',
            parents: [container.id],
        };
        const res = await drive.files.create({
            resource: resource,
            media: {
                body: createReadStream(filePath),
            }
          },
          {
            // Use the `onUploadProgress` event from Axios to track the
            // number of bytes uploaded to this point.
            onUploadProgress: evt => {
              const progress = (evt.bytesRead / fileSize) * 100;
              console.log(`${Math.round(progress)}% complete`);
            },
          }
        );
        console.log("Updated ",res.data.id); 
    }
    
}


if (module === require.main) {
    const drive = new Drive('secrets/jwt.keys.json');
    drive.syncWithCompression("data","iotdata", ".jsonlog").then( (code) => {
        console.log("Done with ",code);
        process.exit(code);
    })

} else {
    // Exports for unit testing purposes
    module.exports = {
        Drive
    };
}

