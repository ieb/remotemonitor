#!/bin/bash
basedir=`dirname $0`
cd $basedir
#sudo ifup ppp0
#sleep 30
#ip r
node drive.js
command=$?
echo Exit code was $command
if [[ $command -eq 10 ]]
then 
    echo sudo shutdown -r now
fi
if [[ $command -eq 11 ]]
then 
    echo git update
    echo sudo systemctl restart pm2
fi
#sudo ifdown ppp0
