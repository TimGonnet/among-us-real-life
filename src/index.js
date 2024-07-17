const PORT = 4046;

const express = require('express');
const http = require('http');
const _ = require('lodash');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const REQUIRED_TASK = [
	'Chambre 1: Dessin collaboratif',
	'Entree: Prendre un selfie dans le miroir et 2 (non fun!)',
];
const TASKS = [
	"Salon: Dice faire 20 points",
	'Cuisine: Vider/Remplir le lave-vaiselle',
	"Cuisine: Couper saucisson",
	'Buanderie: Ramasser le linge PUIS Chambre 2: poser le linge ramasse sur le fil',
	'Exterieur: Recupere un objet dans la piscine avec l epuisette',
	'Exterieur: chanter le reveil du roi lion sur la terrase face a la piscine',
	'Exterieur: Parking, danser la macarena',
	'Garage: biere pong',
	'Chambre de l ambiance: faire et defaire les deux lits',
	'Salle de bain: nettoyer la vitre',
	'Derriere: deplier les chaises er les mettre face au mur (ou inversement)',
];
const LONG_TASKS = [
	'Cuisine: Recuperer verre ou biere PUIS exterieur (piscine): boire son verre',
	'Exterieur: deplacer la bouteille d eau d un a l autre',
	'Salon: Resoudre genius PUIS Chambre 3: coffre de geniu',
];

const N_LONG_TASK = 1;
const N_TASKS = 8;
const N_IMPOSTORS = 1;

const DEBUG = true;

let taskProgress = {};

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
	res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.use('/', express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
	console.log(
		`A user connected with role: ${socket.handshake.query.role}, total: ${io.of('/').sockets.size
		}`
	);

	socket.on('start-game', () => {
		// Get player sockets
		const players = [];
		for (const [_, socket] of io.of('/').sockets) {
			if (socket.handshake.query.role === 'PLAYER') {
				players.push(socket);
			}
		}
		const playerIds = players.map(player => player.id);
		console.log('player sockets', players.length);

		// Assign impostors
		const impostors = _.shuffle(playerIds).slice(0, N_IMPOSTORS);
		for (const [id, socket] of io.of('/').sockets) {
			if (socket.handshake.query.role === 'PLAYER') {
				if (impostors.includes(id)) {
					socket.emit('role', 'Impostor');
					console.log(id, 'is impostor');
				} else {
					socket.emit('role', 'Crewmate');
					console.log(id, 'is crew');
				}
			}
		}

		// Pool of tasks so they are distributed evenly
		let shuffledTasks = [];
		let shuffledLongTasks = [];

		// Dictionary with key as socket.id and value is array of tasks
		const playerTasks = {};

		// Assign tasks
		taskProgress = {};

		function chooseTask(task, prefix, debug) {
			return debug ? prefix + ' ' + task : task;
		}

		for (const player of players) {
			// Make sure there's a pool of shuffled tasks
			if (shuffledTasks.length === 0) {
				shuffledTasks = _.shuffle(TASKS);
				shuffledLongTasks = _.shuffle(LONG_TASKS);
			}

			if (!playerTasks[player.id]) {
				playerTasks[player.id] = {};
			}

			for (let i = 0; i < N_TASKS; i++) {
				const taskId = uuid();
				let task;
				if (i < REQUIRED_TASK.length) {
					task = chooseTask(REQUIRED_TASK[i], 'R', DEBUG);
				} else if (i >= REQUIRED_TASK.length && i < REQUIRED_TASK.length + N_LONG_TASK) {
					task = chooseTask(shuffledLongTasks.pop(), 'L', DEBUG);
				} else {
					task = chooseTask(shuffledTasks.pop(), 'N', DEBUG);
				}
				playerTasks[player.id][taskId] = task;


				if (!impostors.includes(player.id)) {
					taskProgress[taskId] = false;
				}
			}
		}

		console.log('player tasks', playerTasks);

		for (const [id, socket] of io.of('/').sockets) {
			if (playerIds.includes(id)) {
				socket.emit('tasks', playerTasks[id]);
			}
		}

		emitTaskProgress();
	});

	socket.on('report', () => {
		io.emit('play-meeting');
	});

	socket.on('emergency-meeting', () => {
		io.emit('play-meeting');
	});

	socket.on('task-complete', taskId => {
		if (typeof taskProgress[taskId] === 'boolean') {
			taskProgress[taskId] = true;
		}
		emitTaskProgress();
	});

	socket.on('task-incomplete', taskId => {
		if (typeof taskProgress[taskId] === 'boolean') {
			taskProgress[taskId] = false;
		}
		emitTaskProgress();
	});
});

function emitTaskProgress() {
	const tasks = Object.values(taskProgress);
	const completed = tasks.filter(task => task).length;
	const total = completed / tasks.length;
	io.emit('progress', total);

	if (total === 1) {
		io.emit('play-win');
	}
}

server.listen(PORT, () => console.log(`Server listening on *:${PORT}`));