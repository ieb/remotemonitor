#!/bin/bash
basedir=`dirname $0`
cd $basedir

if [ -f reboot.enable ]
then
    rm reboot.enable
    rm restart.enable
    sudo shutdown -r now
fi
if [ -f restart.enable ]
then
    rm restart.enable
    pm2 restart index.js
fi
if [ -f ota.enable ]
then
    ota=$(cat ota.enable)
    if [ a$ota == "aenable" ]
    then
        cat ota.log | gzip  > data/ota.log.gz      
        (
            echo "$(date) Starting OTA Update"
            sudo ifup ppp0
            sleep 5
            ip r
            echo "$(date) Transfering data up"
            node drive.js
            echo "$(date) Transfer Code update"
            git fetch
            sudo ifdown ppp0
            echo "$(date) Start Code update"
            git clean -d -f
            git status | grep "Your branch is behind 'origin/main'"
            if [ $? -eq 0 ]
            then
                echo "$(date) Code changes, restart"
                git merge origin/main
                pm2 restart index.js
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