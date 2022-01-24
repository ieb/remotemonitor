#!/bin/bash
basedir=`dirname $0`
cd $basedir

if [ -f reboot.enable ]
then
    rm reboot.enable
    rm restart.enable
    sudo shutdown -r now
    exit
fi
if [ -f restart.enable ]
then
    rm restart.enable
    pm2 restart index.js
fi
if [ -f ota.enable ]
then
    ota=$(grep enable ota.enable)
    if [ $? -eq 0 ]
    then
        cat ota.log | gzip  > data/ota.log.gz      
        (
            echo "$(date) Starting OTA Update"
            ipuprequired=$(ip r | grep -c 'default via 192.168.2')
            if [ $ipuprequired -eq 0 ]
            then
                sudo ifup ppp0
                sleep 5
            fi
            ip r
            echo "$(date) Transfering data up"
            node drive.js
            echo "$(date) Transfer Code update"
            git fetch
            if [ $ipuprequired -eq 0 ]
            then
                sudo ifdown ppp0
            fi
            echo "$(date) Start Code update"
            git clean -d -f
            git status | grep "Your branch is behind 'origin/main'"
            if [ $? -eq 0 ]
            then
                echo "$(date) Code changes, restart"
                git merge origin/main
                pm2 restart index.js
                sleep 30
            else
                echo "no changes"
            fi
            ls -ltra ~/.pm2/logs 
            echo "Error Log "
            tail -100 ~/.pm2/logs/index-error.log 
            echo "Output Log "
            tail -100 ~/.pm2/logs/index-out.log 
            echo "$(date) End OTA Update"
        ) 2>&1 1>> ota.log
    else 
        rm ota.enable
        rm ota.log
    fi
fi