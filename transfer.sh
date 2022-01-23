#!/bin/bash
basedir=`dirname $0`
cd $basedir
(
gzip transfer.log
cp transfer.log.gz data/
sudo ifup ppp0
sleep 5
ip r
node drive.js
git fetch
sudo ifdown ppp0
git clean -d -f
git status | grep "Your branch is behind 'origin/main'"
if [ $? -eq 0 ]
then
   git merge origin/main
   pm2 restart index.js
else
   echo "no changes"
fi
ls -ltra ~/.pm2/logs 
tail -100 ~/.pm2/logs/index-error.log 
tail -100 ~/.pm2/logs/index-out.log 
) 1>&2 1> transfer.log