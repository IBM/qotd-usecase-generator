const http = require('http');
const https = require('https');

// 5-DEBUG 4-INFO 3-WARN 2-ERROR 1-FATAL
var LOG_LEVEL = 4;  // default is INFO

exports.logLevel = function(level) {
    LOG_LEVEL = getLogLevel(level);
}

function getLogLevel(level){
    var ilevel = LOG_LEVEL; // assume default 

    if (typeof level === 'string' || level instanceof String) {
        switch (level) {
            case 'DEBUG': ilevel = 5; break;
            case 'INFO':  ilevel = 4; break;
            case 'WARN':  ilevel = 3; break;
            case 'ERROR': ilevel = 2; break;
            case 'FATAL': ilevel = 1; break;
            default: ilevel = LOG_LEVEL;
        }
    } else if( Number.isInteger(level) && level <= 5 && level >= 1) { 
        ilevel = level;
    }
    return ilevel;
}

function log(msg,level){
    var ilevel = getLogLevel(level);
    if( ilevel <= LOG_LEVEL ) {
        console.log(msg);    
    }
}

exports.log = log;


function intBetween(min, max) {  
    // between x and y exclusive
    return Math.floor(
      Math.random() * (max - min) + min
    )
}
exports.intBetween = intBetween;

function floatBetween(min, max) {  
    // between x and y exclusive
    Math.random() * (max - min) + min
}
exports.floatBetween = floatBetween;


function pick(optionsArray){
    var len = optionsArray.length;
    var i = intBetween(0,len);
    return optionsArray[i].value;
}

exports.pick = pick;

function pickWeighted(options){
    var optionsArray = [];
    for( const option of options ){
        var weight = option.weight;
        for(var j=0;j<weight;j++){
            optionsArray.push(option);
        }
    }
    return pick(optionsArray);
}

exports.pickWeighted = pickWeighted;

// see: https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve/36481059#36481059
function nextBoxMuller(){
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num / 10.0; // Translate to 0 -> 1
    if (num > 0.5 || num < -0.5) return nextBoxMuller() // resample between 0 and 1 
    return num;   
}

// convert the normal random value from BM to one with 
// the given mean and stdev.  Also if a min and max are 
// supplied, throw out any values out side this range.
function genNormal(mean, stdev, min, max){
    var num = nextBoxMuller();
    var val = stdev * num + mean;
    if( typeof min != 'undefined' && val < min ) {
        val = min
    } else if( typeof max != 'undefined' && val > max ) {
       val = max;
    }
    return val;
}
exports.genNormal = genNormal;


function genNormalInt(mean, stdev, min, max){
    return Math.floor(genNormal(mean,stdev,min, max));
}
exports.genNormalInt = genNormalInt;


function replaceAll(key, value, string) {
    const field = "{{" + key + "}}";
    const replacer = new RegExp(field, 'g');
    return string.replace(replacer, value);
}
exports.replaceAll = replaceAll;



function formatTime(timeInMs) {
    if( 1000 <= timeInMs && timeInMs < 60000 ) {
        var val = timeInMs/1000;
        return val.toFixed(2) + ' sec';
    } else if( 60000 <= timeInMs && timeInMs < 60*60*1000 ) {
        var val = timeInMs/60000;
        return val.toFixed(2) + ' min';
    } else if( 60*60*1000 <= timeInMs ){
        var val = timeInMs/(60*60*1000);
        return val.toFixed(2) + ' hr';
    }
    
    return timeInMs +'ms';
}
exports.formatTime = formatTime;


function httpRequest(options,payload) {
    return new Promise((resolve, reject) => {
        var httpReq = http.request(options, function (res) {
            log(`\t${options.method} http://${options.hostname}:${options.port}${options.path}`,"DEBUG");
            var rawData = [];
            res.on('data', (chunk) => {
                rawData.push(chunk);
            });
            res.on('end', () => {
                log(`\tFinished ${options.method} http://${options.hostname}:${options.port}${options.path}`,"DEBUG");

                if (res.statusCode <= 300 ) {
                    log(`\tGot http://${options.hostname}:${options.port}${options.path}`,"DEBUG");
                    var buffer = Buffer.concat(rawData).toString();
                    if( typeof options.headers != 'undefined' && typeof options.headers.accept != 'undefined' && options.headers.accept == 'application/json') {
                        var obj = JSON.parse(buffer);
                        resolve(obj);
                    } else {
                        resolve();
                    }
                } else {
                    reject(`Failed: ${res.statusCode}`);
                }
            });
        });

        httpReq.on('error', error => {
            log(`\tError: ${error}`,"DEBUG");
            reject(error);
        });

        if( typeof payload != 'undefined'  ) {
            if( typeof options.headers["Content-Type"] != 'undefined' && options.headers["Content-Type"] == "application/json" ) {
                var str = JSON.stringify(payload);
                httpReq.write(str);
            } else {
                httpReq.write(payload);
            }
        }

        httpReq.end();
    })
    .catch((error) => {
        log(`Rejecting ${options.hostname} http://${options.hostname}:${options.port}${options.path}; Error: ${error}`,"DEBUG");
    });
}

exports.httpsRequest = httpsRequest;

function httpsRequest(options,payload) {
    return new Promise((resolve, reject) => {
        var httpReq = https.request(options, function (res) {
            log(`\t${options.method} https://${options.hostname}:${options.port}${options.path}`,"DEBUG");
            var rawData = [];
            res.on('data', (chunk) => {
                rawData.push(chunk);
            });
            res.on('end', () => {
                log(`\tFinished ${options.method} https://${options.hostname}:${options.port}${options.path}`,"DEBUG");

                if (res.statusCode <= 300 ) {
                    log(`\tGot https://${options.hostname}:${options.port}${options.path}`,"DEBUG");
                    var buffer = Buffer.concat(rawData).toString();
                    if( typeof options.headers != 'undefined' && typeof options.headers.accept != 'undefined' && options.headers.accept == 'application/json') {
                        var obj = JSON.parse(buffer);
                        resolve(obj);
                    } else {
                        resolve();
                    }
                } else {
                    reject(`Failed: ${res.statusCode}`);
                }
            });
        });

        httpsReq.on('error', error => {
            log(`\tError: ${error}`,"DEBUG");
            reject(error);
        });

        if( typeof payload != 'undefined' && payload.length>0 ) {
            httpReq.write(payload);
        }

        httpsReq.end();
    })
    .catch((error) => {
        log(`Rejecting ${options.hostname} https://${options.hostname}:${options.port}${options.path}; Error: ${error}`,"DEBUG");
    });
}

exports.httpRequest = httpRequest;