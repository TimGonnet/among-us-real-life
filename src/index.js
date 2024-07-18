const PORT = 4046;

const express = require('express');
const http = require('http');
const _ = require('lodash');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuid } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { connectionStateRecovery: {} });

const REQUIRED_TASK = [
	'Chambre Billy/Ana: Participer au dessin collaboratif',
	"Entrée: Prendre un selfie à 2 personnes dans le miroir sans s'amuser!",
];

const TASKS = [
	"Salon: Dice faire 20 points avec max 4 dés",
	'Cuisine: Vider/Remplir 6 trucs du lave-vaiselle',
	"Cuisine: Couper 6 tranches de saucisson",
	'Chambre Thomas&Marina: Ramasser 6 vêtements PUIS Buanderie: étendre le linge sur le fil',
	"Exterieur: Récupère un objet dans la piscine avec l'épuisette",
	'Exterieur: Chanter le réveil du roi lion sur la terrasse face a la piscine (20s)',
	'Exterieur Parking: Danser la macarena (20s)',
	"Garage: Réussir le bière pong, se mettre sur la ligne d'ombre et mettre la capsule dans les verres",
	"Chambre de l'ambiance: Faire et défaire les deux lits",
	'Salle de bain: Nettoyer la vitre',
	'Derrière: Déplier les chaises et les mettre face au mur (ou inversement)'
];

const LONG_TASKS = [
	'Cuisine: Récupérer un verre ou une bière PUIS extérieur (piscine): boire son verre',
	"Extérieur: Faire un aller-retour avec la bonbonne d'eau d'un bout à l'autre du terrain",
	'Chambre Cyril&Valentine: jeter les dés du genius, retenir les dés (ou photo) coffre de genius PUIS Salon: Résoudre genius',
];

const N_LONG_TASK = process.env.N_LONG_TASK ? +(process.env.N_LONG_TASK) : 1;
const N_TASKS = process.env.N_TASKS ? +(process.env.N_TASKS) : 8;
const N_IMPOSTORS = process.env.N_IMPOSTORS ? +(process.env.N_IMPOSTORS) : 2;
const TIMER_KILL = process.env.TIMER_KILL ? +(process.env.TIMER_KILL) : 30;
const FIRST_TIMER_KILL = process.env.FIRST_TIMER_KILL ? +(process.env.FIRST_TIMER_KILL) : 60;

const DEBUG = !!process.env.DEBUG || false;

let taskProgress = {};
let round = 0;
let alive;
let isBombActive = false;

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
		round = 1;
		// Get player sockets
		const players = [];
		for (const [_, socket] of io.of('/').sockets) {
			if (socket.handshake.query.role === 'PLAYER') {
				players.push(socket);
			}
		}
		const playerIds = players.map(player => player.id);
		console.log('player sockets', players.length);
		alive = players.length;

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

		// Dictionary with key as socket.id and value is array of tasks
		const playerTasks = {};

		// Assign tasks
		taskProgress = {};

		function chooseTask(task, prefix, debug) {
			return debug ? prefix + ' ' + task : task;
		}

		for (const player of players) {
			// Pool of tasks so they are distributed evenly
			let shuffledTasks = [];
			let shuffledLongTasks = [];

			// Make sure there's a pool of shuffled tasks
			if (shuffledTasks.length === 0) {
				shuffledTasks = _.shuffle([...TASKS]);
				shuffledLongTasks = _.shuffle([...LONG_TASKS]);
			}

			if (!playerTasks[player.id]) {
				playerTasks[player.id] = {};
			}

			const nbRequired = REQUIRED_TASK.length
			const nbRequiredAndLong = nbRequired + N_LONG_TASK

			for (let i = 0; i < N_TASKS; i++) {
				const taskId = uuid();
				let task;
				if (i < nbRequired) {
					task = chooseTask(REQUIRED_TASK[i], 'R', DEBUG);
				} else if (i >= nbRequired && i < nbRequiredAndLong) {
					task = chooseTask(shuffledLongTasks[i - nbRequired], 'L', DEBUG);
				} else {
					task = chooseTask(shuffledTasks[i - nbRequiredAndLong], 'N', DEBUG);
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

	socket.on('start-round', () => {
		io.emit('can-kill', false)
		let timer;
		if (round === 1) {
			timer = FIRST_TIMER_KILL;
		} else {
			timer = TIMER_KILL;
		}
		setTimeout(() => {
			io.emit('can-kill', true)
		}, timer * 1000);
	});

	socket.on('killed', () => {
		alive--;
		console.log('Alive:', alive)
	})

	socket.on('start-bomb', () => {
		isBombActive = true;
		io.emit('play-bomb')
	})

	socket.on('stop-bomb', () => {
		isBombActive = false;
		io.emit('stop-bomb')
	})
});

function emitTaskProgress() {
	const tasks = Object.values(taskProgress);
	const completed = tasks.filter(task => task).length;
	const total = completed / tasks.length;
	io.emit('progress', total);
	console.debug('progress', total)

	if (total === 1) {
		io.emit('play-win');
	}
}

server.listen(PORT, () => console.log(`Server listening on *:${PORT}`));