var http 		= require('http'),
	fs 			= require('fs'),
	static 		= require('node-static'),
	file 		= new(static.Server)('./assets'),
	director 	= require('director'),
	router 		= new director.http.Router()
	cron 		= require('cron'),
	cronJob 	= cron.CronJob,
	jade 		= require('jade'),
	mongoose 	= require('mongoose'),
	db 			= {},
	cp 			= require('child_process');
	_ 			= require('underscore'),
	brain 		= require('brain'),
	request 	= require('request');



// MONGODB

var mongo_conn = "mongodb://175580a2-f10b-4fe3-ae3f-7081ea97ada0:af53f2ce-ccc0-4f27-9ea4-584a6737a114@10.0.21.92:25169/db";
if (process.env.VCAP_SERVICES) {
	var env = JSON.parse(process.env.VCAP_SERVICES);
	var mongo = env['mongodb-1.8'][0]['credentials'];
	mongo_conn = "mongodb://" + mongo.username + ":" + mongo.password + "@" + mongo.hostname + ":" + mongo.port + "/" + mongo.db;
	console.log("DB: " + mongo_conn);
} else console.log("DB: Using cached db connection");


mongoose.connect(mongo_conn);

var Schema = mongoose.Schema,
	ObjectId = Schema.ObjectId;

var DataSetSchema = new Schema({
	id: ObjectId,
	timestamp: Number,
	rates: {}
});

db.DataSet = mongoose.model('DataSet', DataSetSchema);



var nets = {
	latest: null,
	lastTrained: "never",
	training: false,
	previous: [],
	previousFails: 0,
	progress: 0
} 





var train = function(input){

	var err = null;
	nets.training = true;


	var trainer = cp.fork(__dirname + '/train.js');


	trainer.on('message', function(data) {
		if (data.type === "update") {

			console.log("CHILD PROCESS SENT an update: ", data.data);

			nets.progress = data.data.progress;

		} else if (data.type === "result") {

			console.log("CHILD PROCESS SENT a result: ", data.data);

			nets.previous.push(nets.latest);
			nets.latest = new brain.NeuralNetwork().fromJSON(data.data.net);
			nets.lastTrained = new Date();
			nets.training = false;
			nets.previousFails = 0;

		} else {
			console.log("CHILD PROCESS SENT ERROR: ", data.data)
			nets.training = false;
			console.log("error training neural net.", new Date(), err);
			nets.previousFails++;
		}
	});


	trainer.send({msg: "train", data: input, options: {
		errorThresh: 0.004, // error threshold to reach
		iterations: 10000   // maximum training iterations
	}})


}



// HELPERS

var render = function(req, res, f, opts){
	
	var filePath = __dirname + '/templates/' + f + ".jade";
	console.log("Rendering file: " + f + " from: " + filePath);

	fs.readFile(filePath, function(err, data) {
		if (!err) {

			var markup;
			try {
				markup = jade.compile(data, null)(opts)
			} catch(e) { 
				markup = "500 Error. Template rendering failed."
				console.log("Error rendering template: ", e);
			}

			res.writeHead(200, {'Content-Type': 'text/html'});			
			res.end(markup)
		} else {
			res.writeHead(404, {'Content-Type': 'text/html'});
			res.end("404, file not found.")
		}
	})
}



var calculateChange = function(sets) {
	var change = [];
	var index = 0;
	var previous = null;

	for (var s in sets) {

		var row = {}

		// bug fix
		if (typeof sets[s].rates.length !== 'undefined') sets[s].rates = sets[s].rates[0];

		for (var fx in sets[s].rates) {
			
			if (index === 0) {
				row[fx] = 0.5;
			} else {

				if (sets[previous].rates[fx] > sets[s].rates[fx]) row[fx] = 0;
				else if (sets[previous].rates[fx] < sets[s].rates[fx]) row[fx] = 1;
				else row[fx] = 0.5;
			}
		}
		change.push(row);
		previous = s;
		index++;
	}

	return change;
}

var brainFood = function(change) {
	var output = [];
	for (var row in change) {
		if (row !== 0 && row !== "0") {
			output.push({input: change[row -1], output: change[row]});
		}
	}

	return output;
}


var mostRecentAsInput = function(){
	var rawData = calculateChange(data.dataSets);
	var latest = rawData[rawData.length - 1];
	console.log("REQ: mostRecentAsInput");
	return latest;
}




// FXGOTCHI


var data = {
	lastUpdated: 0,
	sets: 0,
	dataSets: {}
};


var change = null;


var fxgotchi = {
	cron: new cronJob({
		cronTime: "0 0 * * * *", // every hour
		onTick: function(){fxgotchi.tick();},
		start: true
	}),
	tick: function(){
		var now = new Date();
		console.log(now, " - Cron Tick");

		// get new data from exchange bot

		request('http://openexchangerates.org/api/latest.json?app_id=32d016bfaf0746cd999da5fdddf88325', function (err, resp, info) {
			if (!err && resp.statusCode == 200) {
				var i = null;
				try {
					i = JSON.parse(info);
				} catch(e) {}

				if (i) {
					if (typeof data.dataSets[i.timestamp] === 'undefined') {
						data.dataSets[i.timestamp] = i;
						data.sets = data.dataSets.length;
						data.lastUpdated = i.timestamp;


						// train with new data
						if (!nets.training) train( brainFood( calculateChange(data.dataSets) ) );

						// save to db
						if (db.DataSet) {
							var newDataSet = new db.DataSet();
							newDataSet.timestamp = i.timestamp;
							newDataSet.rates = i.rates;
							newDataSet.save();
						}
					} else console.log("API REQ: Got stale data.")

				} else {
					console.log("API REQ: Error parsng json.")
				}
			}
		});

	},
	sortedKeys: function(){
		var keys = _.keys(data.dataSets);
		var tmp = _.map(keys, function(x){ return parseInt(x); })
		var sorted = tmp.sort(function(a,b){return a-b;});
		tmp = _.map(sorted, function(x){ return x.toString(); })
		return tmp;
	}
};






// load previous from DB
if (db.DataSet) {
	console.log("DB: loading previous sets");
	db.DataSet.find({}, function(err, sets){
		if (!err) {
			console.log("DB: Found " + sets.length + " previous sets");
			data.sets = sets.length;
			var highest = 0;
			_.each(sets, function(set){

				if (set.timestamp > highest) highest = set.timestamp;
				data.dataSets[set.timestamp.toString()] = {
					timestamp: set.timestamp,
					rates: set.rates
				};
			});

			if (highest > data.lastUpdated) data.lastUpdated = highest;

			// train on start
			if (!nets.training) train( brainFood( calculateChange(data.dataSets) ) );
			
		} else {
			console.log("DB ERROR: ", err);
		}
	})
} else console.log('DB ERROR: no db.DataSet Model');




// ROUTES

router.get('/', function(){
	console.log("/ route")
	render(this.req, this.res, 'index', {
		sets: data.dataSets, 
		sortedSets: fxgotchi.sortedKeys(), 
		lastUpdated: data.lastUpdated
	});
});

router.get('/data.json', function(){
	console.log("REQ: data");
	this.res.writeHead(200, {'Content-Type': 'application/json'});
	this.res.end(JSON.stringify(data));
});

router.get('/change.json', function(){
	console.log("REQ: Change");
	this.res.writeHead(200, {'Content-Type': 'application/json'});
	this.res.end(JSON.stringify(calculateChange(data.dataSets)));
})

router.get('/brainfood.json', function(){
	console.log("REQ: Brain Food");
	this.res.writeHead(200, {'Content-Type': 'application/json'});
	this.res.end(JSON.stringify(brainFood(calculateChange(data.dataSets))));
})

router.get('/prediction.json', function(){
	console.log('REQ: prediction')
	if (nets.latest) {

		var input = mostRecentAsInput();
		var prediction = nets.latest.run(input);

		//console.log("Prediction input: ", input);
		//console.log("Prediction ouput: ", prediction);

		this.res.writeHead(200, {'Content-Type': 'application/json'});
		this.res.end(JSON.stringify(prediction));
	} else {
		this.res.writeHead(500, {'Content-Type': 'application/json'});
		this.res.end(JSON.stringify({code: 500, msg: "No net has been trained yet. try /train.json or /nets.json", latestType: typeof nets.latest}));
	}
})

// router.get('/train.json', function(){
// 	console.log("REQ: /train")
// 	if (!nets.training) {
// 		this.res.writeHead(200, {'Content-Type': 'application/json'});
// 		this.res.end(JSON.stringify({code: 200, msg: "Training started."}));
// 		train( brainFood( calculateChange(data.dataSets) ) );
// 	} else {
// 		this.res.writeHead(500, {'Content-Type': 'application/json'});
// 		this.res.end(JSON.stringify({code: 500, msg: "Training already in progress."}));
// 	}
// })

router.get('/nets.json', function(){

	this.res.writeHead(200, {'Content-Type': 'application/json'});
	this.res.end(JSON.stringify({
		training: nets.training,
		progress: nets.progress,
		lastTrained: nets.lastTrained
	}));
})





// SERVER

http.createServer(function (req, res) {

	router.dispatch(req, res, function (err) {
		if (err) {
			console.log("no route: ", req.url, " loading static...")
			req.addListener('end', function () {
				console.log("static serving: ", req.url)
		    	file.serve(req, res);
			});
		} else console.log("served route: ", req.url);
    });
}).listen(process.env.VMC_APP_PORT || 1337, null);

console.log("fxgotchi running on port: ", process.env.VMC_APP_PORT || 1337);