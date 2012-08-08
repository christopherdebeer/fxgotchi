$(document).ready(function(){


	function getPrediction(){
		$.get('/prediction.json', function(data ,status){
			console.log("prediction: ", status, data);


			var $container = $('#prediction');
			$container.find('.time').html((new Date()).toString());

			var $list = $container.find('ul');
			
			// clear list
			$list.html("");

			for (var fx in data) {

				var type = "";
				if (data[fx] < 0.25) type = "down2";
				else if (data[fx] < 0.5) type = "down";
				else if (data[fx] > 0.75) type = "up2";
				else if (data[fx] > 0.5) type = "up";
				

				$list.prepend($('<li class="'+type+'"><a title="'+data[fx]+'" href="#"><span class="fx">'+fx+'</span><span class="val">'+data[fx]+'</span></a></li>'))
			}
		});
	}

	getPrediction()

	function getChange(){
		$.get('/change.json', function(data){
			console.log("latestChange: ", data);

			var $container = $('#latestChange');
			

			var first = true;
			var dir = 1;
			var $list = $container.find('ul');
			for (var fx in data[data.length -1]) {

				var type = "";
				var row = data[data.length -1];
				if (row[fx] < 0.25) type = "down2";
				else if (row[fx] < 0.5) type = "down";
				else if (row[fx] > 0.75) type = "up2";
				else if (row[fx] > 0.5) type = "up";
				
				// determine order direction
				if (first) {
					first = false;
					if (fx[0] === "A") dir = 1;
					else dir = 0;
				}

				var desc = (row[fx] === 0.5 ? "No Change" : (row[fx] ? "Up" : "Down"));

				if (dir) $list.append($('<li class="'+type+'"><a title="'+desc+'" href="#"><span class="fx">'+fx+'</span><span class="val">'+row[fx]+'</span></a></li>')) 
				else $list.prepend($('<li class="'+type+'"><a title="'+desc+'" href="#"><span class="fx">'+fx+'</span><span class="val">'+row[fx]+'</span></a></li>'))
			}
		})
	}

	getChange()


	function getData(){
		$.get('/data.json', function(data){
			console.log("data: ", data);

			var $container = $('#latestActual');

			var lastestUpdateTime = (new Date(parseInt(data.lastUpdated.toString() + "000"))).toString();
			$container.find('.time').html(lastestUpdateTime);

			$('#latestChange .time').html(lastestUpdateTime);

			var last = "";
			for (var i in data.dataSets) {	last = i;	}

			var $list = $container.find('ul');
			for (var fx in data.dataSets[last].rates) {

				var value = data.dataSets[last].rates[fx];
				$list.prepend($('<li><a title="'+fxs[fx]+'" href="#"><span class="fx">'+fx+':</span><span class="val">'+value+'</span></a></li>'))
			}

		});
	}
	
	getData()

	function checkNets() {
		$.get('/nets.json', function(data){
			console.log("nets: ", data);

			$('#header .training').html(data.training.toString());
			$('#header .lastTrained').html(data.lastTrained.toString() === "never" ? "never" : new Date(data.lastTrained.toString()));
			$('#header .progress').html(data.progress.toFixed(2).toString());


			if (!data.training) {
				getPrediction();
				$('#header .progress').html((100).toFixed(2).toString());
			} else setChecker();
		})
	}

	function setChecker () {		
		setTimeout(function(){
			checkNets();
		}, 1000);
	}

	setChecker()


	$("body").on("click", "a", function(ev) {

		var href = $(this).attr('href');
		if (typeof href === 'undefined' || href === "#	" ) {
			ev.preventDefault();
			return false;
		}
	})


})