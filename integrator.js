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
var threadIds = [];
var conversations = [];

oauthClient.post(registrationPortal, function (err, req, res, obj){
		console.log("Token %j", obj);
		token = obj.replace(/"/g,"");
		startListeningStream();
	}
);

function getConversationId(user, threadId, content, onReceiving) {
	botClient = restify.createJsonClient({
		url: process.env.MICROSOFT_DIRECT_LINE_URL,
		headers: {
  			Authorization:"Bearer " + token
  		}
	});

	botClient.post(apiConversations, function(err, req, res, obj) {
		if(!err){
			console.log("Conversation ID: %j", obj);
			getMessages(0, obj.conversationId, threadId);
			if(onReceiving) {
				onReceiving(user, threadId, content, obj.conversationId);
			};
		} else {
			console.log("Error when getting conversationId: %s", err);
		}
	})
}


function sendMessageFromUser(user, message, threadId, conversationId) {
	botClient.post(apiConversations + "/" + conversationId + "/messages", 
		{
			text:message,
			from:user
		}, function(err,req,res) {
			console.log("Message sent to bot! ConversationID[%s]", conversationId);
			if(err) {
				console.log("Error when sending: %s", err);
			}
		});
}

function getMessages(waterMarkNumber, conversationId, threadId) {
	console.log("getting message from %s", waterMarkNumber);
	botClient.get(apiConversations + "/" + conversationId + "/messages?watermark=" + waterMarkNumber, 
		function(err, req, res, obj) {
			console.log("Message received from bot!");
			if(!err) {
				console.log("bot response: %j", obj);
				if(obj.messages[0] != null && 
					obj.watermark && 
					waterMarkNumber < obj.watermark &&
					obj.messages[0].from == "hottie") {
					sendMessageToFlowdock(obj.messages[0].text, threadId);
				}
			} else {
				console.log(err);
			}

			setTimeout(function () {
				if(obj.watermark) {
					waterMarkNumber = obj.watermark;
				}
				getMessages(waterMarkNumber, conversationId, threadId);
			}, 500);
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
				var conversation = conversations.find(function(con) { return con.threadId == message.thread_id});
				if(!conversation){
					console.log("Initializing new conversation as threadId[%s] is not inside %j", message.thread_id, conversations)
					getConversationId(message.user, message.thread_id, message.content, 
						function(user, threadId, content, conversationId) {
							console.log("get conversation call back: user[%s], threadId[%s], content[%s], conversationId[%s]", user, threadId, content, conversationId)
							conversation = {
								threadId:threadId,
								conversationId:conversationId
							};
							console.log("Adding conversation: %j", conversation)
							conversations.push(conversation);
							sendMessageFromUser(user, content, threadId, conversationId);
						});
				} else {
					console.log("Continue conversation as threadId[%s] is inside %j", message.thread_id, conversations)
					sendMessageFromUser(message.user, message.content, message.thread_id, conversation.conversationId);
				}
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

