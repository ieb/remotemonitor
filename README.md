# GPS and Temperature montor.

## Pi setup
turn ssh server on
turn x off to save memory, boot to command line.
turn on i2c, 1 wire, 

## gpsd setup

Could use the tty directly and parse the NMEA stream, however when this was tried with serialport the 
cpu load was at 76%, whereas with gpsd its at 15%, so going with gpsd for the moment.

        sudo apt-get install gpsd gpsd-clients
        sudo adduser pi dialout

        cat << EOF > /etc/defaults/gpsd
        # Devices gpsd should collect to at boot time.
        # They need to be read/writeable, either by user gpsd or the group dialout.
        DEVICES="/dev/serial/by-id/usb-067b_2303-if00-port0"

        # Other options you want to pass to gpsd
        GPSD_OPTIONS=" --speed 4800 "

        # Automatically hot add/remove USB GPS devices via gpsdctl
        USBAUTO="true"
        pi@raspberrypi:~ $ 

        EOF

        sudo systemctl stop gpsd.socket
        sudo systemctl start gpsd.socket

        gpsmon

## SMS

Tried to use gammu, but it was unreliable so sms handling is done in node which seems very reliable.

Used https://www.npmjs.com/package/serialport-gsm


        See https://wiki.dd-wrt.com/wiki/index.php/Mobile_Broadband#Huawei for prefered user port.
        use  udevadm info --name=/dev/ttyUSB3 --attribute-walk to get the interface numbers.


        pi@raspberrypi:~ $ ls -l /dev/serial/by-id/usb-*
        lrwxrwxrwx 1 root root 13 Jan  8 11:09 /dev/serial/by-id/usb-067b_2303-if00-port0 -> ../../ttyUSB0
        lrwxrwxrwx 1 root root 13 Jan  8 11:09 /dev/serial/by-id/usb-HUAWEI_Technology_HUAWEI_Mobile-if00-port0 -> ../../ttyUSB1
        lrwxrwxrwx 1 root root 13 Jan  8 11:10 /dev/serial/by-id/usb-HUAWEI_Technology_HUAWEI_Mobile-if03-port0 -> ../../ttyUSB2
        lrwxrwxrwx 1 root root 13 Jan  8 11:10 /dev/serial/by-id/usb-HUAWEI_Technology_HUAWEI_Mobile-if04-port0 -> ../../ttyUSB3
        pi@raspberrypi:~ $ vi 

        sudo 

## wwlan0

The modem as a cbc_ether device that shows up as wwan0 but there doesnt seem to be a 
good way of configuring its router, so I disabled.


        cat << EOF > /etc/modprobe.d/raspi-blacklist.conf
        blacklist sr_mod
        blacklist cdc_ether

        EOF




# udev

Tried several times to create stable symlinks to devices, but found /dev/servial/by-id to work better.
this doesnt work.

        078xxxx@raspberrypi:~ $ more /etc/udev/rules.d/10-usb-serial.rules
        SUBSYSTEM=="tty", ATTRS{idProduct}=="2303", ATTRS{idVendor}=="067b", SYMLINK+="ttyGPS"
        SUBSYSTEMS=="usb", ENV{.LOCAL_ifNum}="$attr{bInterfaceNumber}"
        SUBSYSTEM=="tty", ATTRS{idProduct}=="1436", ATTRS{idVendor}=="12d1", SYMLINK+="tty3G_%E{.LOCAL_ifNum}"
        SUBSYSTEM=="tty", ATTRS{idProduct}=="1436", ATTRS{idVendor}=="12d1", TAG+="systemd", ENV{SYSTEMD_WANTS}="powersaving.service"



# Modeswitch

Didnt need to modeswitch the E173 as it happens anyway, but if I did, here is some info.

12d1:1446 is the default
USB Modem 12d1:1436

If mode switing is required then its something like this.
sudo usb_modeswitch -v 0x12d1 -p 0x1446 -M 55534243000000000000000000000011060000000000000000000000000000 -V 0x12d1 -P 0x1436 -s 50 -m 0x01


# 3G Internet

        sudo apt-get install ppp usb-modeswitch wvdial

 kill the wvdialcfg process, it hangs in the last part of the isntall

        cat << EOF > /etc/wvdial.conf 
        [Dialer Defaults]
        New PPPD = yes
        Dial Command = ATDT
        Dial Attempts = 1
        Check Def Route = yes
        Auto Reconnect = yes
        Init1 = ATZ
        Init2 = ATQ0 V1 E1 S0=0 &C1 &D2 +FCLASS=0
        Init3 = AT+CGDCONT=1,"IP","giffgaff.com"
        Stupid Mode = 1
        Modem Type = Analog Modem
        ISDN = 0
        Phone = *99#
        Modem = /dev/serial/by-id/usb-HUAWEI_Technology_HUAWEI_Mobile-if00-port0
        Username = gg
        Password = p
        Baud = 460800

        [Dialer giffgaff]
        Init3 = AT+CGDCONT=1,"IP","giffgaff.com"

        EOF


        cat << EOF > /etc/network/interfaces.d/ppp0
        iface ppp0 inet wvdial
           provider giffgaff
           post-up echo "3G ppp0 is online"   
        EOF

        cat << EOF > /etc/ppp/peers/wvdial
        noauth
        name wvdial
        usepeerdns
        defaultroute
        replacedefaultroute
        EOF

To start ppp0, then ping 8.8.8.8, the packet latency should be different from wired.

        sudo ifup ppp0
        ip r
        ping 8.8.8.8
        sudo ifdown ppp0

        ip r



## Upload data periodically

Perfiosly used go get github.com/google/skicka but that has a 400MB footprint installing go and takes forever to install

https://developers.google.com/drive/api/v3/quickstart/nodejs

now uses node drive.js which uploads from a crontab

## Crontabs

one of periodic upload.


## service

        npm install pm2 -g
        pm2 startup
        pm2 start index.js
        pm2 save




## Install node and npm

        sudo apt-get install nodejs npm

## Install tracker code and sms responder.

        git clone <tracker git repo, tbd>
        cd tracker
        npm install

# Todo

* [x] Use GPS tty directly in node to reduce cpu usage - total fail. node uses 76% using serialport and very simple processing, gpsd uses 15%, stick with gpsd.
* [x] Make gammu-smsd stable when USB fails or use gammu cli or go direct to tty - went direct to modem using seralport-gsm node module which is well supported and works.
* [x] Implement sync upload
* [x] Do periodic restart on gpsd which seems to hang, perhaps a periodic reboot would be better.
* [x] add systemd service for the tracker logger
* [x] decide how to sync time, probably ntpd on start if the gpsd doesnt do it.
* [x] create uploader in node and run periodically or on demand from sms message.

testingZZ

