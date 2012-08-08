
var brain = require('brain');
var net = new brain.NeuralNetwork();
var _ = require('underscore');

var updateProgress = function (resp) {
	process.send({ 
		code: 200, 
		type: "update", 
		data: {
			resp: resp, 
			progress: (resp.iterations / ops.options.iterations) * 100
		}
	});
}

var ops = {
	training: false,
	data: null,
	options: {
		errorThresh: 0.004, // error threshold to reach
		iterations: 2000,   // maximum training iterations
		callback: updateProgress,
		callbackPeriod: 10,
		log: false
	}
}



process.on('message', function(data) {


  
	if (data.msg === "train" && !ops.training) {

		ops.data = data.data;
		var backupOptions = ops.options;
		ops.options = _.defaults(data.options, backupOptions);

		var error = false;
		ops.training = true;
		try {
			var result = net.train(ops.data, ops.options);
		} catch(err) {
			error = err;
			ops.training = false;
		}

		if (!error) {

			process.send({ 
				code: 200, 
				type: "result", 
				data: {
					net: net.toJSON(),
					result: result
				}
			});

			ops.training = false;

		} else process.send({ 
			code: 500, 
			type: "error", 
			data: error
		});



	} else {
		process.send({ 
			code: 500, 
			type: "error", 
			data: 'Already busy training.' 
		});
	}

});
