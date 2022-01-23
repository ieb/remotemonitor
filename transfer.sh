#!/bin/bash
basedir=`dirname $0`
cd $basedir
(
sudo ifup ppp0
sleep 5
ip r
node drive.js
command=$?
echo Exit code was $command
if [[ $command -eq 10 ]]
then 
    echo sudo shutdown -r now
fi
sudo ifdown ppp0
) 1>&2 1>> transfer.log