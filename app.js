const express = require('express');
const fs = require('fs');
const requestIp = require('request-ip');

BRANDING=null;
if( typeof process.env.BRANDING == "string" && process.env.BRANDING.length>0  ){
    BRANDING = process.env.BRANDING;
}

app = express();
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.set('port', process.env.PORT || 3012);

app.enable('trust proxy');

app.use(express.static(__dirname + '/public'));
app.use(express.json());
app.use(requestIp.mw());

app.get('/', function (req, res) {
    if( typeof req.headers.accept != 'undefined' && req.headers.accept.indexOf('application/json') >= 0 ) {
        var activeUsecase = executor.getActiveUseCase();
        var usecases = [];
        var files = fs.readdirSync('./usecases');
        for( var i=0; i<files.length; i++){
            if( files[i].endsWith('.json') ) {
                var file = fs.readFileSync('./usecases/'+files[i]).toString();
                var obj = JSON.parse(file);
                var status = "";
                if( activeUsecase != null && obj.id == activeUsecase.id) {
                    status = activeUsecase.status;
                } 
                usecases.push( { "id": obj.id, "name": obj.name, "description": obj.description, "status": status });    
            }
        }
        res.json( usecases );
    } else {
        res.render('home', { "branding" : BRANDING });
    }
});

app.get('/version',
    function (req, res) {
        console.log('/version');
        res.send(`${appName} v${appVersion}, build: ${buildInfo}.`);
    }
);

//-------------------------------------------------------------------------------------------------
// Service management
require('./services.js');

const executor = require('./executor.js');

//-------------------------------------------------------------------------------------------------
// Use Case management

// globals
_activeUsecase = null;
_timeRemaining = null;
_defaultLoggers = {};

app.get('/usecase/:id', function (req, res) {
    var usecaseId = req.params.id;

    var usecase;
    if( typeof _activeUsecase != 'undefined' && _activeUsecase != null && _activeUsecase.id == usecaseId ) {
        usecase = _activeUsecase;
    } else {
        var data = fs.readFileSync('./usecases/'+usecaseId+'.json').toString();
        var usecase = JSON.parse(data);
    }

    if( req.headers.accept.indexOf('application/json') >= 0 ) {
        res.json(usecase);
    } else {
        res.render('usecase', { "name": usecase.name, "id": usecase.id, "branding" : BRANDING });
    }
});


app.put('/usecase/:id', function (req, res) {
    var useCaseId = req.params.id; 
    var useCase;
    var data = req.body;

    if( typeof _activeUsecase == 'undefined' || _activeUsecase ==  null ) {
        // lets start her up
        if ( data.action == "start" ) {
            var fileData = fs.readFileSync('./usecases/'+useCaseId+'.json');
            useCase = JSON.parse(fileData);
            useCase.completed = false;
            executor.executeUseCase(useCase);
        } 
    } else {    
        useCase = _activeUsecase;
        if( ( typeof _activeUsecase.status != 'undefined' || _activeUsecase.status == 'completed' ) && data.action == "start" ) {
            // a redo
            var fileData = fs.readFileSync('./usecases/'+useCaseId+'.json');
            useCase = JSON.parse(fileData);
            useCase.completed = false;
            executor.executeUseCase(useCase);
        } else if( _activeUsecase.status == 'running' && data.action == "stop" ) {
            _activeUsecase.status = 'stopped';
        } else if( _activeUsecase.status == 'paused' && data.action == "resume" ) {
            _activeUsecase.status = 'active';
        }
    }
    
    res.json(useCase);
});

//=======================================================================================
// Use case manager end points

app.delete('/usecase/:id', function (req, res) {
    var usecaseId = req.params.id;
    try{
        fs.unlinkSync('./usecases/'+usecaseId+'.json');
        var usecases = getUseCases();
        res.json(usecases);  
    } catch( err ) {
        res.status(500).send(err);        
    }
});

app.post('/usecase', function (req, res) {
    var usecaseId = req.params.id;
    var body = req.body;
    // todo: lots of validation
    var usecaseId = body.id;
    try{
        var data = JSON.stringify(body,null,4);
        fs.writeFileSync('./usecases/'+usecaseId+'.json',data);
        var usecases = getUseCases();
        res.json(usecases);  
    } catch( err ) {
        res.status(500).send(err);        
    }
});

function getUseCases(){
    var files = fs.readdirSync('./usecases/');
    var usecases = [];
    for( var i=0; i<files.length; i++){
        var file = files[i];
        if( file.endsWith(".json") ) {
            var data = fs.readFileSync('./usecases/'+file).toString();
            var usecase = JSON.parse(data);
            var id = usecase.id;
            var name = usecase.name;
            var description = usecase.description;
            usecases.push( { "id": id, "name": name, "description": description } );
        }
    }
    return usecases;
}

app.get('/usecase', function (req, res) {
    if( req.headers.accept.indexOf('application/json') >= 0 ) {
        var usecases = getUseCases();
        res.json(usecases);    
    } else {
        res.status(400).send("only JSON");
    }
});

app.get('/manager', function (req, res) {
    var usecases = getUseCases();
    res.render('manager', { "usecases": usecases, "branding" : BRANDING });
});

app.get('/source/:id', function (req, res) {
    var useCaseId = req.params.id;
    var fileData = fs.readFileSync('./usecases/'+useCaseId+'.json');
    res.render('source', { "source": fileData });
});

app.post('/reset', function(req,res) {
    executor.resetAllServices();
    res.status(200).send("OK");
});


app.get('/library', function (req, res) {
    var result = updateLibrary();
    res.status(200).send(result);
});

function updateLibrary(){
    if( fs.existsSync('./library') ) {
        // reset all usecases
        // first check if there is a config map with scenarios in it, mapped to /library
        // then copy all of those to the /usecases local folder (wiping out existing ones)
        var count = 0;
        var files = fs.readdirSync('./library');
        for (const file of files) {
            if( file.endsWith(".json") ) {
                fs.copyFileSync('./library/'+file, './usecases/'+file, fs.constants.COPYFILE_FICLONE);
                count++;
            }
        }
        return "count: " + count;
    }
    return "no library";
}

updateLibrary();

//=======================================================================================

app.get('/version',
    function (req, res) {
        utils.log('/version');
        var ip = req.clientIp;
        res.send(`${appName} v${appVersion}, build: ${buildInfo}.  Your IP: ${ip}`);
    }
);

const package = require('./package.json');
const appName = package.name;
const appVersion = package.version;
const buildInfo = fs.readFileSync('build.txt');

app.listen(app.get('port'), '0.0.0.0', function () {
    console.log(`Starting ${appName} v${appVersion}, ${buildInfo} on port ${app.get('port')}`);
});

