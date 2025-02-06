const fs = require('fs');
const moment = require('moment');
const utils = require('./utils.js');

//----------------------------------------------------------------------------------------------------

// returns true is the service has active anaomlies
function activeAnomalies() {

    var instanceStatus = [];
    var serviceDefaults = getServiceDefaults();
    var data = getServiceData();

    for( var serviceId in data ){
        var serviceInstances = data[serviceId];
        var serviceDefault = serviceDefaults[serviceId];
        if( Array.isArray(serviceInstances) ) {
            for( var i of serviceInstances ) {
                var instanceId = i.instance;
                delete i.instance;
                var active = !deepEqual(i, serviceDefault);
                var status = { 
                    "serviceId": serviceId,
                    "instanceId": instanceId,
                    "active": active
                }
                instanceStatus.push(status);
            }
        }
    }

    return instanceStatus;
}

exports.activeAnomalies = activeAnomalies;

app.get('/anomalies', function(req,res){
    if( req.headers.accept.indexOf('application/json') >= 0 ) {
        var active = activeAnomalies()
        res.json(active);
    } else {
        res.render('anomalies', { "branding" : BRANDING });
    }

});

function resetAllServicesToDefaults(){
    var resetData = {};
    var data = getServiceData(); // existing data, with instance ids
    for( var serviceId in data ) {
        resetData[serviceId] = [];
        for( var service of data[serviceId] ) {
            var instanceId = service.instance;
            var defaultValue = getServiceDefaults(serviceId);
            defaultValue.instance = instanceId;
            resetData[serviceId].push(defaultValue);
        }
    }

    fs.writeFileSync('./serviceData/services.json',JSON.stringify(resetData,null,4));  
}
exports.resetAllServicesToDefaults = resetAllServicesToDefaults;

_lastCheckIns = {};

function getServiceData(){
    if( fs.existsSync('./serviceData/services.json') ) {
        var data = fs.readFileSync('./serviceData/services.json').toString();
        var services = JSON.parse(data);
        return services;    
    }
    return {};
}
exports.getServiceData = getServiceData;

function mergeCheckinData(services){
    // add last checkin information
    for( var serviceId in services ) {
        for( var instance of services[serviceId] ){
            var serviceInstance = instance.instance;
            var checkinKey = serviceId+":"+serviceInstance;
            if( typeof _lastCheckIns[checkinKey] != 'undefined' ){
                try{
                    var checkInTime = new moment(_lastCheckIns[checkinKey]);
                    instance.lastCheckIn = checkInTime.fromNow();
                } catch( error ) {
                    instance.lastCheckIn = "unknown";
                }
            }
        }
    }
}

function getServiceDefaults(serviceId){
    var services;
    if( fs.existsSync('./config/services_defaults.json') ) {
        var serviceDefaults = fs.readFileSync('./config/services_defaults.json').toString();
        services = JSON.parse(serviceDefaults);   
    } else {
        // fall back on hard coded no logger defaults
        var serviceDefaults = fs.readFileSync('./services_defaults.json').toString();
        services = JSON.parse(serviceDefaults);
    }
    if( typeof serviceId == 'undefined' ) {
        return services;
    } else {
        return services[serviceId];
    }
    
}

function findInstance(configurations, instanceId){
    if( Array.isArray(configurations) ) {
        for(var i=0; i<configurations.length; i++){
            if( configurations[i].instance == instanceId ) return configurations[i];
        }
    } 
    return null;
}

function findInstanceIndex(configurations, instanceId){
    if( Array.isArray(configurations) ) {
        for(var i=0; i<configurations.length; i++){
            if( configurations[i].instance == instanceId ) return i;
        }
    } 
    return null;
}


function getServiceConfiguration( serviceId, instanceId ) {
    // gets configuration, and if it doesn't exist will create (andsave)
    // a default value

    utils.log("Getting service configuration for serviceId: " + serviceId + " instanceId: " + instanceId, "DEBUG" );

    var data = getServiceData();
    var service = data[serviceId];
    if( typeof service == 'undefined' ) {
        // first time service being called for this service return defaults
        var serviceConfiguration = getServiceDefaults(serviceId);
        updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
        return serviceConfiguration;
    } 

    if( Array.isArray(service) ) {
        if( service.length == 0 ) {
            // the service is defined but no instances.  again initialize with defatults
            var serviceConfiguration = getServiceDefaults(serviceId);
            updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
            return serviceConfiguration;    
        }

        var serviceConfiguration = findInstance(service,instanceId);
        if( serviceConfiguration == null ) {
            // instead of defaults we get the first in the array (the oldest pod)
            // and copy from it.  We check podLimit on the way.
            var first = service[0];
            var serviceConfiguration = JSON.parse( JSON.stringify(first) );
            updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
            return serviceConfiguration;
        } else {
            // we return the given service/instance, and update the interest timestamp
            updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
            return serviceConfiguration;
        }
    }

    // use defaults
    var serviceConfiguration = getServiceDefaults(serviceId);
    updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
    return serviceConfiguration;
}
exports.getServiceConfiguration = getServiceConfiguration;

function getAllServiceConfigurations( serviceId ) {
    var data = getServiceData();
    var service = data[serviceId];
    return service;
}
exports.getAllServiceConfigurations = getAllServiceConfigurations;


function updateServiceConfiguration(serviceId, instanceId, serviceConfiguration ){
    // serviceConfiguration.lastCheckin = new moment().format();
    serviceConfiguration.instance = instanceId;

    var services = getServiceData();
    if( typeof services[serviceId] == 'undefined' ) {
        services[serviceId] = [];
    }
    var index = findInstanceIndex(services[serviceId],instanceId);
    if( index == null) {
        // just push into service array
        services[serviceId].push(serviceConfiguration);
    } else {
        // need to update/reaplce existing instance
        services[serviceId].splice(index, 1, serviceConfiguration);
    }

    var data = JSON.stringify(services,null,4);
    fs.writeFileSync('./serviceData/services.json',data);  
    return serviceConfiguration;
}
exports.updateServiceConfiguration = updateServiceConfiguration;

app.get('/services', async function (req, res) {
    if( req.headers.accept.indexOf('application/json') >= 0 ) {
        var services = getServiceData();
        mergeCheckinData(services);
        res.json(services);
    } else {
        res.render('services', { "branding" : BRANDING });
    }
});

app.get('/services/:serviceId', function (req, res) {
    var serviceId = req.params.serviceId;
    var includeCheckInData = req.query.includeCheckInData;
    var instanceId = req.clientIp; 
    if( typeof req.query.instance != 'undefined' ) instanceId = req.query.instance;

    var lastCheckInKey = serviceId+":"+instanceId;

    var serviceConfiguration = getServiceConfiguration( serviceId, instanceId );
    if( typeof serviceConfiguration != 'undefined' ) {
        if( req.headers.accept.indexOf('application/json') >= 0 ) {
            if( typeof includeCheckInData != 'undefined' ) {
                var lastCheckIn = _lastCheckIns[lastCheckInKey];
                if( typeof lastCheckIn != 'undefined' ) {
                    serviceConfiguration.lastCheckIn = lastCheckIn;
                }
            }
            /// update last checkin
            _lastCheckIns[lastCheckInKey]= new moment().format();
            res.json(serviceConfiguration);
        } else {
            res.render('service', { "serviceId": serviceId, "instanceId": instanceId, "branding" : BRANDING } );            
        }
    } else {
        res.status(404).send("Service data not found");
    }
});

app.put('/services/:serviceId', function (req, res) {
    var serviceId = req.params.serviceId;
    var instanceId = req.clientIp;
    if( typeof req.query.instance != 'undefined' ) instanceId = req.query.instance;

    var serviceConfigurationOrig = getServiceConfiguration( serviceId, instanceId );
    if( typeof serviceConfigurationOrig != 'undefined' ) {
        var serviceConfigurationUpdate = JSON.parse( JSON.stringify(serviceConfigurationOrig));
        var update = req.body;
        serviceConfigurationUpdate.cpuHogs = update.cpuHogs;
        serviceConfigurationUpdate.memHogs = update.memHogs;
        serviceConfigurationUpdate.healthy = update.healthy;

        var endpoints = serviceConfigurationOrig.endpoints;
        var mpaths = Object.keys(endpoints);
        for( var path of mpaths ) {
            var endpointOrig = serviceConfigurationOrig.endpoints[path];
            var endpointUpdate = serviceConfigurationUpdate.endpoints[path];
            if( Number.isInteger(update.endpoints[path].latency.mean) ) {
                if( 100 < update.endpoints[path].latency.mean && update.endpoints[path].latency.mean < 5000 ) {
                    endpointUpdate.latency.mean = update.endpoints[path].latency.mean;
                }
            }
            if( Number.isInteger(update.endpoints[path].latency.stdev) ) {
                if( 0 < update.endpoints[path].latency.stdev && update.endpoints[path].latency.stdev < 5000 ) {
                    endpointUpdate.latency.stdev = update.endpoints[path].latency.stdev;
                }
            }
            if( Number.isInteger(update.endpoints[path].latency.min) ) {
                if( 100 < update.endpoints[path].latency.min && update.endpoints[path].latency.min < update.endpoints[path].latency.mean ) {
                    endpointUpdate.latency.min = update.endpoints[path].latency.min;
                }
            }
            if( Number.isInteger(update.endpoints[path].latency.max) ) {
                if( endpointOrig.latency.mean < update.endpoints[path].latency.max && update.endpoints[path].latency.max < 10000 ) {
                    endpointUpdate.latency.max = update.endpoints[path].latency.max;
                }
            }
        }


        if( !deepEqual(serviceConfigurationOrig,serviceConfigurationUpdate) ) {
            updateServiceConfiguration(serviceId, instanceId, serviceConfigurationUpdate );
        }
        res.json(serviceConfigurationUpdate);
    } else {
        res.status(404).send("Service data not found");
    }
});

function deepEqual(obj1, obj2) {
    if(obj1 === obj2) // it's just the same object. No need to compare.
        return true;
    if(isPrimitive(obj1) && isPrimitive(obj2)) // compare primitives
        return obj1 === obj2;
    if(Object.keys(obj1).length !== Object.keys(obj2).length)
        return false;
    // compare objects with same number of keys
    for(let key in obj1) {
        if(!(key in obj2)) return false; //other object doesn't have this prop
        if(!deepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
}

function isPrimitive(obj) {
    return (obj !== Object(obj));
}

app.delete('/services/:serviceId', function (req, res) {
    var serviceId = req.params.serviceId;
    // var instanceId = "*";
    // if( typeof req.query.instance != 'undefined' && req.query.instance != "" ) instanceId = req.query.instance;
    // var serviceConfiguration = getServiceDefaults(serviceId);
    // if( serviceConfiguration == null ) {
    //     res.status(404).send(`Service ${serviceId} not found`);
    //     return;
    // }

    // if( instanceId == "*" ) {
        // reset all instances
        var serviceConfiguration = getServiceDefaults(serviceId);
        var services = getServiceData();
        for( var instance of services[serviceId] ) {
            updateServiceConfiguration(serviceId, instance.instance, serviceConfiguration );
        }
        res.json(serviceConfiguration);
    // } else {
    //     updateServiceConfiguration(serviceId, instanceId, serviceConfiguration );
    //     res.json(serviceConfiguration);
    // }
});

app.delete('/services', function (req, res) {
    resetAllServicesToDefaults();
    var services = getServiceData();
    res.json(services);
});



// prune every 5 minnutes

function pruneOldCheckins(){
    var fiveMinAgo = new moment().subtract(5,'minutes');
    var prunedData = {};
    var data = getServiceData(); // existing data, with instance ids
    for( var serviceId in data ) {
        prunedData[serviceId] = [];
        for( var instance of data[serviceId] ) {
            var checkInKey = serviceId+":"+instance.instance;
            var lastCheckInStr = _lastCheckIns[checkInKey];
            if( typeof lastCheckInStr != 'undefined' ) {
                try{
                    var lastCheckIn = new moment(lastCheckInStr);
                    if( lastCheckIn ) {
                        if( lastCheckIn.isBefore(fiveMinAgo) ) {
                            utils.log( "PRUNED " + checkInKey, "DEBUG" );
                        } else {
                            prunedData[serviceId].push(instance);                        
                        }
                    }
                } catch(error){
                    utils.log( "Unable to create moment date from last check in: "+ lastCheckIn, "DEBUG");
                }
            } else {
                utils.log( "Last Check In not found for "+ checkInKey, "DEBUG");
            }
        }
    }

    fs.writeFileSync('./serviceData/services.json',JSON.stringify(prunedData,null,4));  
}

setInterval( pruneOldCheckins, 120000); //
