require('dotenv-extended').load();
const crypto = require("crypto");
var EventSource = require('eventsource');
var restify = require('restify');

const registrationPortal = '/api/tokens/conversation'
const apiConversations = '/api/conversations'
var oauthClient = restify.createStringClient({
  url: process.env.MICROSOFT_DIRECT_LINE_URL,
  headers: {
  	Authorization:process.env.MICROSOFT_DIRECT_LINE_SECRET
  }
});

var botClient = null;
var token = "";
var conversationId = "";
var waterMark = 0;

oauthClient.post(registrationPortal, function (err, req, res, obj){
		console.log("Token %j", obj);
		token = obj.replace(/"/g,"");
		getConversationId();
	}
);

function getConversationId() {
	botClient = restify.createJsonClient({
		url: process.env.MICROSOFT_DIRECT_LINE_URL,
		headers: {
  			Authorization:"Bearer " + token
  		}
	});

	botClient.post(apiConversations, function(err, req, res, obj) {
		if(!err){
			console.log("Conversation ID: %j", obj);
			conversationId = obj.conversationId;
			startListeningStream();
		} else {
			console.log("Error when getting conversationId: %s", err);
		}
	})
}


function sendMessageFromUser(user, message, threadId) {
	botClient.post(apiConversations + "/" + conversationId + "/messages", 
		{
			text:message,
			from:user
		}, function(err,req,res) {
			console.log("Message sent!");
			if(!err) {
				waterMark ++;
				getMessages(waterMark, threadId);
			} else {
				console.log("Error when sending: %s", err);
			}
		});
}

function getMessages(waterMarkNumber, threadId) {
	console.log("getting message from %s", waterMarkNumber);
	botClient.get(apiConversations + "/" + conversationId + "/messages?watermark=" + waterMarkNumber, 
		function(err, req, res, obj) {
			console.log("Message received!");
			if(!err) {
				console.log("bot response: %j", obj);
				if(obj.messages[0] == null) {
					setTimeout(function () {
						getMessages(waterMarkNumber, threadId);
					}, 500);
				} else {
					waterMark = parseInt(obj.watermark);
					sendMessageToFlowdock(obj.messages[0].text, threadId);
				}
			} else {
				console.log(err);
			}
		});
}
function startListeningStream() {
	var stream = new EventSource(process.env.FLOWDOCK_ENDPOINT);
	stream.onmessage = function(event) {
		var message = JSON.parse(event.data);
		var request = {
			type: "message"
		};
		if(message.event == 'message'){
			console.log("sending message from %s as %s", message.user, message.content);
			if(!message.content.startsWith('[bot]')) {
				sendMessageFromUser(message.user, message.content, message.thread_id);
			}
		}
	};

	stream.onerror = function(err) {
		console.log("EventSource failed." + err);
	}
}
function sendMessageToFlowdock(message, threadId) {
	console.log("Message[%s], ThreadId[%s]", message,threadId);
	var flowdockClient = restify.createJsonClient ({
		url : "https://api.flowdock.com"
	});
	flowdockClient.basicAuth('andre.sato@arctouch.com', 'arctouch-11');
	flowdockClient.post('/flows/arctouch/test-flow/threads/' + threadId + '/messages', 
		{
			'event' : 'message',
			'content' : '[bot] ' + message 
		}, function (err,req,res) {
			if(err) {

				console.log(err);
			} else {
				console.log("Message sent to flowdock!")
			}
		})
}

