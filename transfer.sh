#!/bin/bash
basedir=`dirname $0`
cd $basedir
(
#sudo ifup ppp0
#sleep 5
#ip r
#node drive.js
git fetch
echo sudo ifdown ppp0
git clean -d -f
git status | grep "Your branch is behind 'origin/main'"
if [ $? -eq 0 ]
then
   git merge origin/main
   echo pm2 restart index.js
else
   echo "no changes"
fi
) 1>&2 1> transfer.log