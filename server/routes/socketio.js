module.exports = function(app) {
	var dp = app.drawphone;
	var stripTags = require("striptags");

	app.io.on("connection", function(socket) {
		var thisGame;
		var thisUser;

		socket.on("joinGame", onJoinGame);

		socket.on("newGame", function(data) {
			if (dp.locked) {
				sendLockedError(socket, dp.minutesUntilRestart);
				return;
			}

			var theName = stripTags(data.name);
			if (theName.length > 2 && theName.length <= 16) {
				thisGame = dp.newGame();
				thisUser = thisGame.addPlayer(theName, socket);
				socket.emit("joinGameRes", {
					success: true,
					game: thisGame.getJsonGame(),
					you: thisUser.getJson()
				});
			} else {
				socket.emit("joinGameRes", {
					success: false,
					error: "Name too short/long"
				});
			}
		});

		socket.on("tryStartGame", function(data) {
			if (!thisUser || !thisGame) return;

			if (dp.locked) {
				sendLockedError(socket, dp.minutesUntilRestart);
				return;
			}

			if (data.timeLimit !== false && thisUser.isHost) {
				thisGame.startNewRound(
					data.timeLimit,
					data.wordPackName,
					data.showNeighbors
				);
			}
		});

		socket.on("tryReplacePlayer", function(data) {
			const thisRound = thisGame.currentRound;

			if (!thisGame || !thisRound) return;

			const toReplaceId = data.playerToReplace.id;

			if (thisUser && thisRound.canBeReplaced(toReplaceId)) {
				thisUser = thisRound.replacePlayer(
					toReplaceId,
					thisUser,
					thisGame.code
				);
				thisGame.initPlayer(thisUser);
				thisRound.updateWaitingList();
				thisRound.nextLinkIfEveryoneIsDone();
			} else {
				thisRound.sendUpdateToPotentialPlayers(thisGame.code);
			}
		});

		socket.on("kickPlayer", function(data) {
			if (!thisGame || !thisUser) return;

			var idToKick = data.playerToKick.id;
			var playerToKick = thisGame.getPlayer(idToKick);
			if (thisUser.isHost && playerToKick) {
				//this will simulate the 'disconnect' event, and run all of the
				//	methods that were tied into that in the initPlayer function
				playerToKick.socket.disconnect();
			}
		});

		socket.on("replacePlayerWithBot", function(data) {
			const isInGame = thisGame && thisGame.currentRound;
			const isHost = thisUser && thisUser.isHost;
			if (!isInGame || !isHost) return;

			const oldPlayer = data.playerToReplaceWithBot;
			const botPlayer = thisGame.newBotPlayer(
				"👻 The Ghost of " + oldPlayer.name
			);
			const thisRound = thisGame.currentRound;

			if (botPlayer && thisRound.canBeReplaced(oldPlayer.id)) {
				thisRound.replacePlayer(oldPlayer.id, botPlayer);
				thisRound.updateWaitingList();
				thisRound.nextLinkIfEveryoneIsDone();
			}
		});

		socket.on("hostUpdatedSettings", function(setting) {
			if (!thisGame || !thisUser) return;

			if (thisUser.isHost) {
				thisGame.sendUpdatedSettings(setting);
			}
		});

		socket.on("addBotPlayer", function() {
			if (!thisGame || !thisUser) return;

			if (thisUser.isHost) {
				thisGame.addBotPlayer();
			}
		});

		socket.on("removeBotPlayer", function() {
			if (!thisGame || !thisUser) return;

			if (thisUser.isHost) {
				thisGame.removeBotPlayer();
			}
		});

		function onJoinGame(data) {
			thisGame = dp.findGame(data.code);
			var theName = stripTags(data.name);
			if (!thisGame) {
				socket.emit("joinGameRes", {
					success: false,
					error: "Game not found"
				});
			} else if (theName.length <= 2 || theName.length > 16) {
				socket.emit("joinGameRes", {
					success: false,
					error: "Name too short/long"
				});
			} else {
				const thisRound = thisGame.currentRound;
				if (!thisGame.inProgress) {
					thisUser = thisGame.addPlayer(theName, socket);
					socket.emit("joinGameRes", {
						success: true,
						game: thisGame.getJsonGame(),
						you: thisUser.getJson()
					});
				} else {
					thisUser = thisGame.newPlayer(theName, socket);
					thisRound.potentialPlayers.push(thisUser);
					thisRound.sendUpdateToPotentialPlayers(thisGame.code);
				}
			}
		}
	});
};

const sendLockedError = (socket, minutesUntilRestart) => {
	socket.emit("joinGameRes", {
		success: false,
		error: "Oopsie woopsie",
		content:
			"The Drawphone server is pending an update, and will be restarted " +
			getTimeLeft(minutesUntilRestart) +
			'. Try again then! <div style="font-size: .75em;margin-top:.8em">' +
			"If you're the techy type, check the update status " +
			'<a href="https://github.com/tannerkrewson/drawphone/actions" ' +
			'target="_blank" rel="noopener noreferrer">here</a>.</div>'
	});
};

const getTimeLeft = minutes => {
	if (minutes <= 0) return "momentarily";
	return "in " + minutes + " minute" + (parseInt(minutes) !== 1 ? "s" : "");
};
