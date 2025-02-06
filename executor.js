const servicesManager = require('./services.js');
const utils = require('./utils.js');
const async = require('async');
const { NodeSSH } = require('node-ssh')
const fs = require('fs');
const moment = require('moment');
const { env } = require('process');
// const async = require('async');

var usecaseTimer =  null;
var usecaseTimeout = null;

if( typeof process.env.AUTO_SHUTOFF != "undefined" ){
    try{ 
        var time = parseInt( process.env.AUTO_SHUTOFF );
        if( time >= 10000 && time <= 4*60*60*1000 ) {  // only accept values between 10 seconds and 4 hours
            usecaseTimeout = time;
            utils.log( "Setting timeout to " + time + "ms.", null, "INFO" );
        } else {
            utils.log( "No timeout set.", null, "INFO" );
        }
    } catch( err ) {
        // no auto shutoff
    }
}

exports.executeUseCase = function (usecase) {
    // if there is another active use case then return error
    if (_activeUsecase != null) {
        if (_activeUsecase.id != usecase.id) {
            utils.log( "Another use case is currently active ("+_activeUsecase.id+"). Reset it before starting a new one ("+usecase.id+")." );
        } else {
            return; // nothing to do
        }
    }

    if( usecaseTimeout != null ){
        usecaseTimer = setTimeout(resetAllServices, usecaseTimeout);  // max active time is 1 hr
    }
    _activeUsecase = usecase;
    _activeUsecase.status = 'running';
    var now = new moment();
    utils.log("[" + now.utc().format() + "] Starting use case (" + usecase.id + ") " + usecase.name );
    var steps = usecase.steps;
    async.eachSeries(steps, executeStep, (err) => {
        if (err) throw err;
        // _activeUsecase.status = 'completed';
        if( typeof _activeUsecase != 'undefined' && _activeUsecase ) {
            utils.log("[" + now.utc().format() + "]\t\tAll steps initiated use case (" + usecase.id + ")" );
        } 
    });

}

exports.getActiveUseCase = function () {
    return _activeUsecase;
}

async function executeStep(step) {
    if( _activeUsecase == null ) {
        return;
    }
    if( _activeUsecase.status == 'stopped' ) {
        var now = new moment();
        utils.log("[" + now.utc().format() + "]\t\tSkipping step: " + step.name );
        step.status = "skipped";
        return;
    } 

    var now = new moment();
    utils.log("[" + now.utc().format() + "]\t\tStep: " + step.name );
    step.status = "active";
    switch (step.type) {
        case 'delay': return await stepDelay(step);
        case 'setCallDistributionOverride': return setCallDistributionOverride(step);
        case 'removeCallDistributionOverride': return removeCallDistributionOverride(step);

        case 'setDependentLogger': return setDependentLogger(step);
        case 'removeDependentLogger': return removeDependentLogger(step);
        case 'wasErrorLogger': return wasErrorLogger(step);

        case 'memory': return setMemory(step);
        case 'cpu': return setCpu(step);
        case 'latency': return setLatency(step);

        case 'setLogger': return setLogger(step);
        case 'removeLogger': return removeLogger(step);

        case 'ssh_exec': return sshExec(step);
        case 'http': return httpRest(step);

        case 'reset_all_services': return resetAllServices();
    }
}

_delay = null;

async function stepDelay(step) {
    return new Promise((resolve, reject) => {
        _delay = setTimeout(() => {
            step.status = "completed";
            resolve();
        }, step.duration);
    });
}

// =====================================================================================
// http rest

var resetRest = [];

function httpRest(step) {

    var resetCall = step.reset;

    if( resetCall ) {
        resetRest.push(step);
    }

    utils.log("Calling external REST service at " + step.call.options.hostname, null ,"INFO");

    const options = step.call.options;
    const payload = step.call.payload;

    utils.httpRequest(options,payload)
    .then( () => {
        utils.log("REST service sucessfully called.", null, "INFO");
        step.status = "completed";
        return;
    })
    .catch( (error) => {
        utils.log("REST service problem. Error: \n" + error, null, "INFO");
        throw error;
    });
}

async function resetHttpRest(step){
    utils.log("Calling external REST service (reset) at " + step.reset.options.hostname, null ,"INFO");

    const options = step.reset.options;
    const payload = step.reset.payload;

    utils.httpRequest(options,payload)
    .then( () => {
        utils.log("Reset REST service sucessfully called.", null, "INFO");
        return;
    })
    .catch( (error) => {
        utils.log("Reset REST service problem. Error: \n" + error, null, "INFO");
        throw error;
    });

}

// =====================================================================================
// ssh

var resetCmds = [];

function sshExec(step) {
    var host = step.options.host;
    var user = step.options.user;
    var cmd = step.options.cmd;
    var resetCmd = step.options.cmd;

    if( resetCmd ) {
        step.options.name = step.name;
        resetCmds.push(step.options);
    }

    if( cmd ) {
        var privKey = fs.readFileSync('./keys/usecase_generator_rsa', 'utf8');

        const ssh = new NodeSSH();
        ssh.connect({
            host: host,
            username: user,
            privateKey: privKey
        })
        .then(() => {
            ssh.execCommand(cmd)
            .then((result) => {
                if (result.code == 0) {
                    step.status = "completed";
                } else {
                    step.status = "failed";
                }
                utils.log(step.name + '- ssh exec');
                utils.log('STDOUT: ' + result.stdout);
                utils.log('STDERR: ' + result.stderr);
            })
            .catch( (err) => {
                utils.log('ERROR: ' + step.name + '- ssh exec' + err );
            });
        });
    }
}

async function resetSshExec(options){
    var host = options.host;
    var user = options.user;
    var resetCmd = options.resetCmd;

    var privKey = fs.readFileSync('./keys/usecase_generator_rsa', 'utf8');

    const ssh = new NodeSSH();
    ssh.connect({
        host: host,
        username: user,
        privateKey: privKey
    })
    .then(() => {
        ssh.execCommand(resetCmd).then((result) => {
            console.log('Reset script for ' + options.name );
            console.log('STDOUT: ' + result.stdout);
            console.log('STDERR: ' + result.stderr);
        })
        .catch( (err) => {
            utils.log('Reset script ERROR: ' + step.name + '- ssh exec' + err );
        });
    });

}

app.get('/publicKey', function( req, res) {
    var pk = fs.readFileSync('./keys/usecase_generator_rsa.pub').toString();
    res.send(pk);
});

// =====================================================================================
// reset


function resetAllServices() {
    servicesManager.resetAllServicesToDefaults();

    // execute any ssh exec reset scripts
    async.eachOfSeries(resetCmds, resetSshExec, () => { resetCmds = [] });

    // execute any http rest reset scripts
    async.eachOfSeries(resetRest, resetHttpRest, () => { resetRest = [] });

    var now = new moment();
    var uc = "";
    if( _activeUsecase ) {
        uc = "] Use case (" + _activeUsecase.id + ") terminated";
    }
    utils.log("[" + now.utc().format() + uc );
    utils.log("[" + now.utc().format() + " Resetting all services.");
    _activeUsecase = null;

    if( usecaseTimer ){
        clearTimeout(usecaseTimer);
    }
    

}
exports.resetAllServices = resetAllServices;



// =====================================================================================
// logger

function setLogger(step) {
    var service = step.service;
    var options = step.options;
    var loggerId = step.id;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            config.loggers[loggerId] = options;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        step.status = "failed";
        utils.log("setLogger; service not found: " + service);
    }
}

function removeLogger(step) {
    var service = step.service;
    var loggerId = step.id;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            delete config.loggers[loggerId];
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        step.status = "failed";
        utils.log("setLogger; service not found: " + service);
    }
}

// =====================================================================================
// WAS Error logger

function wasErrorLogger(step) {
    var service = step.service;
    var loggerId = step.id;
    var options = step.options;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            config.loggers[loggerId] = options;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("[wasErrorLogger] serviceConfiguration not found: " + service);
    }
}

// =====================================================================================
// dependent logger

function setDependentLogger(step) {
    var service = step.service;
    var endpoint = step.endpoint;
    var loggerId = step.id;
    var options = step.options;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            if (typeof config.endpoints[endpoint].loggers == 'undefined') {
                config.endpoints[endpoint].loggers = {};
            }
            config.endpoints[endpoint].loggers[loggerId] = options;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("setDependentLogger; service not found: " + service);
    }
}

function removeDependentLogger(step) {
    var service = step.service;
    var endpoint = step.endpoint;
    var loggerId = step.id;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            if (typeof config.endpoints[endpoint].loggers == 'undefined') {
                config.endpoints[endpoint].loggers = {};
            }
            delete config.endpoints[endpoint].loggers[loggerId];
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("removeDependentLogger; service not found: " + service);
    }
}

// =====================================================================================
// call distribution

function setCallDistributionOverride(step) {
    var service = step.service;
    var endpoint = step.endpoint;
    var options = step.options;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);
    var podLimit = step.podLimit;
    if (typeof podLimit == 'undefined') podLimit = serviceConfiguration.length;

    if (typeof serviceConfiguration != 'undefined') {

        for (var i = 0; i < podLimit; i++) {
            var config = serviceConfiguration[i];
            console.log("######### DEBUG #########");
            console.log( JSON.stringify(config,null,4));
            config.endpoints[endpoint].responseOverride = options;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("setCallDistributionOverride; service not found: " + service);
    }
}

function removeCallDistributionOverride(step) {
    var service = step.service;
    var endpoint = step.endpoint;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            delete config.endpoints[endpoint].responseOverride;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("removeCallDistributionOverride; service not found: " + service);
    }
}


//=========================================================================================
// core metrics (CPU, mem,latency)

function setMemory(step) {
    var service = step.service;
    var value = step.value;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            config.memHogs = value;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        step.status = "failed";
        utils.log("setMemory; service not found: " + service);
    }
}

function setCpu(step) {
    var service = step.service;
    var value = step.value;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            config.cpuHogs = value;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("setCpu; service not found: " + service);
    }
}


function setLatency(step) {
    var service = step.service;
    var value = step.value;
    var endpoint = step.endpoint;

    var serviceConfiguration = servicesManager.getAllServiceConfigurations(service);

    if (typeof serviceConfiguration != 'undefined') {

        for (var config of serviceConfiguration) {
            if (typeof config.endpoints[endpoint] == 'undefined') {
                utils.log("setLatency; endpoint not found: " + service);
                step.status = "failed";
                return;
            }
            config.endpoints[endpoint].latency = value;
            var sourceIp = config.instance;
            servicesManager.updateServiceConfiguration(service, sourceIp, config);
        }
        step.status = "completed";

    } else {
        utils.log("setLatency; service not found: " + service);
        step.status = "failed";
    }

}

