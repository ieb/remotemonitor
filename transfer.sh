#!/bin/bash
basedir=`dirname $0`
cd $basedir
gzip -f transfer.log
cp transfer.log.gz data/
(
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
git reset --hard
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
) 2>&1 1> transfer.log