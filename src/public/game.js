const socket = io({
	query: {
		role: 'PLAYER'
	}
});

const emergencyMeeting$ = document.querySelector('#emergency-meeting');
const killed$ = document.querySelector('#killed');
const bomb$ = document.querySelector('#bomb');
const enableSound$ = document.querySelector('#enable-sound');
const progress$ = document.querySelector('#progress');
const progressBar$ = document.querySelector('.progress-bar');
const report$ = document.querySelector('#report');
const tasks$ = document.querySelector('#tasks');

function removeTasks() {
	// Remove existing tasks
	while (tasks$.firstChild) {
		tasks$.removeChild(tasks$.firstChild);
	}
}

report$.addEventListener('click', () => {
	socket.emit('report');
});

killed$.addEventListener('click', () => {
	if (confirm("t'es sur ?")) {
		socket.emit('killed');
		const tasks = document.getElementsByClassName('task-checkbox')
		console.log('tasks.length', tasks.length)
		for (let task of tasks) {
			socket.emit('task-complete', task.id);
		}
		removeTasks();
	}
});

let role;
let isBombActive = false;

bomb$.addEventListener('click', () => {
	console.debug('bomb', role, isBombActive)
	if (!isBombActive) {
		if (role === 'Impostor') {
			console.log('play bomb server')
			socket.emit('start-bomb');
		}
	} else {
		socket.emit('stop-bomb');
	}
});

emergencyMeeting$.addEventListener('click', () => {
	socket.emit('emergency-meeting');
	emergencyMeeting$.style.display = 'none';
});


socket.on('tasks', tasks => {
	removeTasks()

	for (const [taskId, task] of Object.entries(tasks)) {
		const task$ = document.createElement('li');
		const label$ = document.createElement('label');

		const checkbox$ = document.createElement('input');
		checkbox$.type = 'checkbox';
		// checkbox.name = "name";
		checkbox$.classList.add("task-checkbox");
		checkbox$.id = taskId;
		checkbox$.onchange = event => {
			console.log('checkbox change', event.target.checked);
			if (event.target.checked) {
				socket.emit('task-complete', taskId);
			} else {
				socket.emit('task-incomplete', taskId);
			}
		};

		label$.appendChild(checkbox$);
		label$.appendChild(document.createTextNode(task));

		task$.appendChild(label$);
		tasks$.appendChild(task$);
	}
});

socket.on('can-kill', canKill => {
	console.debug('canKill', canKill)
	const killImage = document.getElementById('kill-image');
	if (canKill) {
		killImage.src = 'images/ok.png'
	} else if (canKill) {
		killImage.src = 'images/ko.png'
	}
});


socket.on('role', newRole => {
	role = newRole;
	console.debug(role)
	hideRole();
	const roleContainer = document.getElementById('role');
	const roleLink = document.createElement('a')
	roleLink.classList.add('role');
	const role$ = roleContainer.appendChild(roleLink);
	role$.appendChild(
		document.createTextNode(`You are a(n) ${role}. Click to dismiss.`)
	);
	role$.onclick = () => hideRole();
});

function hideRole() {
	document
		.querySelectorAll('.role')
		.forEach(element => (element.style.display = 'none'));
}

socket.on('progress', progress => {
	progress$.innerHTML = (progress * 100).toFixed(0);
	progressBar$.style.width = `${progress * 100}%`;
});

/**
 * Sounds
 */

async function wait(milliseconds) {
	await new Promise(resolve => {
		setTimeout(() => resolve(), milliseconds);
	});
}

const soundPlayer = new Audio();
const SOUNDS = {
	meeting: new Audio('/sounds/meeting.mp3'),
	sabotage: new Audio('/sounds/sabotage.mp3'),
	start: new Audio('/sounds/start.mp3'),
	sussyBoy: new Audio('/sounds/sussy-boy.mp3'),
	voteResult: new Audio('/sounds/vote-result.mp3'),
	youLose: new Audio('/sounds/you-lose.mp3'),
	youWin: new Audio('/sounds/you-win.mp3'),
	bomb: new Audio('/sounds/bomb.mp3'),
};

socket.on('play-meeting', async () => {
	await playSound(SOUNDS.meeting);
	await wait(2000);
	await playSound(SOUNDS.sussyBoy);
});

socket.on('play-win', async () => {
	await playSound(SOUNDS.youWin);
});

socket.on('play-bomb', async () => {
	isBombActive = true;
	console.debug('play bomb client')
	await playSound(SOUNDS.bomb);
});

socket.on('stop-bomb', async () => {
	isBombActive = false;
	console.debug('stop bomb client')
	await stopSound(SOUNDS.bomb);
});

enableSound$.addEventListener('click', async () => {
	console.log('enable sound');
	enableSound$.style.display = 'none';
	soundPlayer.play();
});

async function playSound(audio) {
	console.debug('playSound')
	await audio.play();
}


async function stopSound(audio) {
	console.debug('stopSound')
	await audio.pause();
	audio.currentTime = 0;
}
