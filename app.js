
require('dotenv-extended').load();

var restify = require('restify');
var builder = require('botbuilder');
var levelup = require('levelup')
var dateFormat = require('dateformat');



//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer({
	name: 'hottie'
});

var db = levelup('./mydb')
var now = new Date();
var key = dateFormat(now, "dd-mm-yyyy");
var orders = db.get(key, function (err, value) {
	if (err) {
	}
	else {
	  return value;
	}
});
if(orders == null) {
	orders = [];
}

server.listen(3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/', connector.listen());
server.post('/api/messages', connector.listen());
server.post('/v3/conversations', connector.listen());

server.get('/echo/:name', function (req, res, next) {
	console.log("req: %s", JSON.stringify(req.body));
	res.send(req.params);
	return next();
});



//=========================================================
// Bots Dialogs
//=========================================================

var recognizer = new builder.LuisRecognizer("https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/24f74398-87b6-48b0-bc18-1e617d6a7bd4?subscription-key=a6ba998bc6c34823ab87157ed9cba0e6&verbose=true");
bot.recognizer(recognizer);

bot.dialog('Order', [
	function (session, args, next) {
		var meat = builder.EntityRecognizer.findEntity(args.intent.entities, 'meat');
		var dishType = builder.EntityRecognizer.findEntity(args.intent.entities, 'type dish');
		var sideDish = builder.EntityRecognizer.findEntity(args.intent.entities, 'side menu');
		var order = getFirstOrderFromUser(session);
		session.dialogData.order = order;
		if(meat) {
			order.meat = meat.entity;
			orders.push(order);
			session.dialogData.order.meat = meat.entity;
		}
		if(dishType) {
			order.dishType = dishType.entity;
			orders.push(order);
			session.dialogData.order.dishType = dishType.entity;
		}
		if(sideDish) {
			order.sideDish = sideDish.entity;
			orders.push(order);
			session.dialogData.order.sideDish = sideDish.entity;
		}

		if(meat && dishType && sideDish) {
			session.send("You have ordered: %s %s %s", meat.entity, dishType.entity, sideDish.entity);
			session.endDialog();
		} else {
			next();
		}
	},
	function(session, next) {
		var order = session.dialogData.order 
		if(order.meat && order.dishType) {
			session.send("You have ordered: %s %s", order.meat, order.dishType);
			next();
		} else if(order.meat && order.sideDish) {
			session.send("You have ordered: %s %s", order.meat, order.sideDish);
		} else if(order.meat) {
			session.send("You have ordered: %s", order.meat);
		}
		session.send('How do you like your %s', order.meat);
		builder.Prompts.choice(session, "?", ["empanado", "grelhado", "acebolado"]);
	},
	function(session, results, next) {
		var order = session.dialogData.order;
		if(results.response) {
			console.log(JSON.stringify(results.response));
			order.dishType = results.response.entity;
			orders.push(order);
			session.dialogData.order.dishType = results.response.entity;
		}

		if(!order.sideDish) {
			builder.Prompts.text(session, "Do you have any special request or side dish to add to your order? If yes, please say, otherwise just reply [no]");
		}
		else {
			next();
		}
	},
	function (session, results) {
		var order = session.dialogData.order;
		if(results.response && results.response != 'no') {
			order.sideDish = results.response;
			orders.push(order);
			session.dialogData.order.sideDish = results.response;
			session.send("Order complete! You have ordered: %s %s %s", order.meat, order.dishType, order.sideDish);
		}
		else {
			session.send("Order complete! You have ordered: %s %s", order.meat, order.dishType);
		}
		session.endDialog();
	}
]).triggerAction({
    matches: 'Order'
});

bot.dialog('list', function(session) {
	orders.forEach(function(value) {
		session.send("%s: %s %s %s", value.name, value.meat, value.dishType, value.sideDish );
	});
}).triggerAction({
    matches: 'list'
});

bot.dialog('Greetings', [
function (session, args, next) {
        if (!session.userData.name) {
            session.beginDialog('/profile');
        } else {
            next();
        }
    },
    function (session, results) {
        session.send('Hello %s!', session.userData.name);
        if(session.userData.restaurant == 'none') {
        	session.beginDialog('/admin');
        } else {
        	session.send('You are the responsible to take order for %s!', session.userData.restaurant);
        	session.endDialog();
        }
    }
]).triggerAction({
    matches: 'Greetings'
});

bot.dialog('/profile', [
    function (session) {
        builder.Prompts.text(session, 'Hi! What is your name?');
    },
    function (session, results) {
        session.userData.name = results.response;
        if(session.userData.restaurant == 'none') {
        	session.replaceDialog('/admin');
        }
    }
]);

bot.dialog('/admin', [
	function (session) {
		session.send('Are you who will get all orders and make the order to the');
		builder.Prompts.choice(session, "restaurant?", ["yes", "no"]);
	},
	function (session, results) {
		if(results.response == 'yes') {
			builder.Prompts.text(session, 'Which restaurant/place?');
			next();
		} else {
			session.userData.restaurant = 'none';
			session.endDialog();
		}
	},
	function (session, results) {
		session.userData.restaurant = results.response;
		builder.Prompts.text(session, 'I see, thanks!');
		session.endDialog();
	}
]);

function getFirstOrderFromUser(session) {
	var userOrders = orders.filter(function(item){
		return (item.name == session.userData.name);
	});
	if(userOrders.length == 0) {
		return { "name": session.userData.name}
	}

	return userOrders[0];
}