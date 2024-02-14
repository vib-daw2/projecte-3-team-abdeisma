const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const httpServer = createServer(app);

app.use(express.static("public"));

const io = new Server(httpServer, {});

const fs = require("fs");
// Cargar las preguntas desde el archivo preguntas.json
const preguntas = JSON.parse(fs.readFileSync("preguntas.json", "utf-8"));
// Generar un identificador único para cada partida creada
const { v4: uuidv4 } = require('uuid');
const users = [];
const socketUsernames = {};
let tiempo;
//objecte que guarda les estadistiques de cada jugador
const userScores = {};
//objecte que guarda les preguntas de la partida
const preguntasPorSala = {};
//objecte per guardar el index de les preguntas per cada partida (pregunta[0]...)
let currentQuestionIndex = {};
//array que guarda quants clics s'han fet a cada respuesta
var clickCounts = [0, 0, 0, 0];
//guardar registre de les partidas creades
const partidas = {};

io.on("connection", (socket) => {
  console.log("Cliente conectado...");

//middleware comprovar si usuari té nickname
  socket.on("nicknameUser", (data) => {
   const nicknameUser = data.nicknameUser;

    // Verificar si el usuario ha proporcionado un username
    if (nicknameUser) {
       usernameUser = nicknameUser;
      } else {
        console.log("El usuario no ha proporcionado un nickname.");
        io.to(socket.id).emit("redirect", { redirectUrl: "/index.html" });
   }
});
 
  // Obtener el nickname del socket
  socket.on("nickname", function(data) {
         const socketID = socket.id;
          socket.nickname = data.nickname;
          const nicknameUser = socket.nickname;
          users.push({
              userID: socket.id,
              username: socket.nickname
          });
          const redirectUrl = "/home.html";
          // respondre al que ha enviat
          socket.emit("nickname recibido",{"response":"ok", redirectUrl, socketID, nicknameUser})
  })
  // Array con todos los usuarios
  socket.on("get users", function() {
      socket.emit("users", { users });
  });

  socket.on("crear partida", function(configuracionPartida) {
    try {
      const { title, quantity, topics, nicknameAdmin, time } = configuracionPartida;
      // Array de preguntas por tema
      const preguntasPorTema = {};
      // Agrupar las preguntas según el tema seleccionado
      preguntas.forEach((pregunta) => {
          const tema = pregunta.modalidad.toLowerCase();
          if (topics.includes(tema)) {
              preguntasPorTema[tema] = preguntasPorTema[tema] || [];
              preguntasPorTema[tema].push(pregunta);
          }
        });
        // Array de les preguntas finales
        const preguntasPartida = [];
  
      // Seleccionar preguntas aleatorias según el tema seleccionado
      topics.forEach((tema) => {
            const preguntasDelTema = preguntasPorTema[tema] || [];
        // Obtener selección de preguntas aleatorias de este tema
        const preguntasAleatorias = shuffleArray(preguntasDelTema).slice(0, Math.floor(quantity / topics.length));
            preguntasPartida.push(...preguntasAleatorias);
        });
  
      // Función para barajar aleatoriamente el array de preguntas
      function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }
  
        // Si queda un número impar de preguntas, elegir aleatoriamente una pregunta de cualquier tema
        const preguntasRestantes = quantity - preguntasPartida.length;
        if (preguntasRestantes > 0) {
            const temasDisponibles = topics.filter((tema) => preguntasPorTema[tema]?.length > Math.floor(quantity / topics.length));
            for (let i = 0; i < preguntasRestantes; i++) {
                const temaAleatorio = temasDisponibles[Math.floor(Math.random() * temasDisponibles.length)];
                const preguntasDelTema = preguntasPorTema[temaAleatorio] || [];
                preguntasPartida.push(preguntasDelTema[Math.floor(Math.random() * preguntasDelTema.length)]);
            }
        }
  
      // Generar identificador único para la partida
          const idPartida = uuidv4();
          const salaPartida = `partida-${idPartida}`;
          const codigoPartida = idPartida.slice(0, 4);
      // Unir al usuario que ha creado la partida a la sala
      socket.join(salaPartida);
          
      // Añadir esta partida al objeto de partidas
      partidas[salaPartida] = { 
            codigoPartida: codigoPartida,
            nicknameAdmin: nicknameAdmin,
            salaGame: idPartida,
          };
          console.log(partidas)

         socket.emit("preguntas partida", { idPartida, preguntasPartida, nicknameAdmin, time, codigoPartida });
         
      } catch (error) {
        console.error("Error al procesar la solicitud de creación de la partida:", error);
      }
  });
 
  // Gestionar el código de partida enviado por el usuario
  socket.on("codigo partida", (codigoInputValue) => {
 // Verificar si existeix una partida amb el codi proporcionat
 const salaPartidaEncontrada = Object.values(partidas).find(partida => partida.codigoPartida === codigoInputValue);

 if (salaPartidaEncontrada) {
  // Si existe, se redirigirá al usuario al lobby de la partida
  const sala = salaPartidaEncontrada.salaGame;
  const nicknameCreador = salaPartidaEncontrada.nicknameAdmin;
  console.log("La partida existe.");
  socket.emit("unir partida", { sala, nicknameCreador, codigoInputValue });
} else {
  // Si el código no existe se le informará
  console.log("La partida no existe.");
  socket.emit("no existe");
}
});

// Gestionar cuando un usuario se une a través de la URL
socket.on("join game", function (data) {
  const { idPartida, nicknameUser, socketID } = data;
  const salaPartida = `partida-${idPartida}`;
  socket.join(salaPartida);

  // Asociar el socket.id con el nickname
  socketUsernames[socket.id] = nicknameUser;
  console.log(`${nicknameUser} se ha unido a la sala: ${salaPartida}`);

  // Obtener la lista de usuarios que se han unido a la sala y sus nombres de usuario
  const usersInRoom = io.sockets.adapter.rooms.get(salaPartida);
  const usernamesArray = usersInRoom
    ? Array.from(usersInRoom).map((socketID) => socketUsernames[socketID])
    : [];

  // Enviar la lista de usuarios al cliente para mostrarlos en la lista
  io.to(salaPartida).emit("users in room", {usersArray: Array.from(usersInRoom), usernamesArray });
});
// Redirigir a los usuarios de la sala (data) a game.html
socket.on("startGame", function(data) {
   const { idPartida } = data;
   const salaPartida = `partida-${idPartida}`;

   // Emitir un evento a todos los usuarios de la sala para dirigirlos a game.html
   io.to(salaPartida).emit("redirectToGame");
});

// Pasar las preguntas a main.js
socket.on("preguntas configuradas", function(data) {
   const { idPartida, preguntasPartida, nicknameAdmin, time } = data;
   const salaPartida = `partida-${idPartida}`;
   console.log("partida empezada:  " + idPartida);
   io.to(salaPartida).emit('start game', data);
   
});

// Inicializar objeto de preguntas de esa partida
socket.on("users started", function(data) {
  const { users, roomId, preguntas } = data;
  const salaPartida = `partida-${roomId}`;
 
  // Guardar las preguntas en el objeto global
  preguntasPorSala[salaPartida] = preguntas;
  //cada sala té un index independent per evitar errors amb múltiples partidas simultanies
  currentQuestionIndex[salaPartida] = 0;
 
 });
  
 socket.on("game started", function(data) {
  const { time, roomId } = data;
  const salaPartida = `partida-${roomId}`;
  const roomsInfo = io.sockets.adapter.rooms;

    // Verificar si la sala específica existe en la información de las salas
    if (roomsInfo.has(salaPartida)) {
        // Obtener la cantidad de conexiones en la sala específica
        const connectionsInRoom = roomsInfo.get(salaPartida).size;
        // Mostrar la cantidad de conexiones por consola
        console.log("Cantidad de conexiones en la sala " + salaPartida + ":", connectionsInRoom);
    }

  // Obtener las preguntas del objeto global
  const preguntas = preguntasPorSala[salaPartida];
  // Obtener el índice de esa partida
  const currentIndex = currentQuestionIndex[salaPartida];
  const timeNumeric = parseInt(time) * 1000;
  
// Comprobar si hay más preguntas
 if (currentIndex < preguntas.length) {
  // Iniciar el temporizador para la pregunta actual
  let timer = setTimeout(() => {
    console.log("¡Se acabó el tiempo!")
    socket.emit("tiempo agotado", { time, roomId });
  }, timeNumeric);
  
    //Si hay mas preguntas
    io.to(salaPartida).emit("new question", { question: preguntas[currentIndex], time: time });
    console.log(currentQuestionIndex)
    currentQuestionIndex[salaPartida]++;
  } else {
      // Si no hay más preguntas
      io.to(salaPartida).emit("game over");
  }
 });

  // Cuando acaba el tiempo de la pregunta, dar 7 segundos para comprobar los resultados
  socket.on("extra time", function(data) {
  const { time, roomId } = data;
  const salaPartida = `partida-${roomId}`;

    // Añadir un contador antes de empezar la siguiente pregunta
    setTimeout(() => {
      // Emitir "game started" para que empiece la siguiente
      socket.emit("time finished", { time, roomId });
  }, 5000);
});

  // Recibir respuestas, verificar el resultado y actualizar el objeto "userScores"
  socket.on("respuesta", function(data) {
  const { buttonIndex, pregunta, idPartida, nicknameUser, tiempoRespuesta, tiempoPregunta } = data;
  const preguntaObj = JSON.parse(pregunta);
  
  // Mapear las letras para obtenerlas en formato numérico
  const indexMap = { 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
  // Obtener el índice numérico
  const numericIndex = indexMap[buttonIndex];
  // Incrementar el contador en el array clickCounts utilizando el índice
  clickCounts[numericIndex]++;

  console.log("array: ", clickCounts)
  const username = nicknameUser;
  const salaPartida = `partida-${idPartida}`;

    // Crear puntuación para el usuario si aún no la tiene
    if (!userScores[nicknameUser]) {
    userScores[nicknameUser] = {puntuacion: 0,correctas: 0,incorrectas: 0 };
  }
    // Respuesta del usuario y respuesta correcta
    const respuestaUsuario = preguntaObj.respuestaGame[buttonIndex];
    const respuestaCorrecta = preguntaObj.correcta;

    // Calcular la puntuación basada en el tiempo restante
    let puntuacion = 0;
    let isCorrecta = false;
    if (respuestaUsuario === respuestaCorrecta) {
    //si la respuesta es correcta:
    const maxPuntuacion = 750; // Puntuación màxima possible
    const minPuntuacion = 100; //Puntuación mínima possible
    const tiempoMaximo = tiempoPregunta; 
    const tiempoMinimo = 1; 
    const tiempoRestanteNormalizado = tiempoRespuesta / tiempoMaximo;  // Normalizar el tiempo restante

    // Calcular la puntuación basándose en el tiempo restante
    puntuacion = Math.round(minPuntuacion + (maxPuntuacion - minPuntuacion) * tiempoRestanteNormalizado * 0.5);  // Ajustar el factor de tiempo
    // Actualizar la puntuación del usuario
    userScores[nicknameUser].correctas++;

    // Actualizar la puntuación acumulada del usuario
    userScores[nicknameUser].puntuacion += puntuacion;

    // Definir que la respuesta es correcta
    isCorrecta = true;
  } else {
      // Respuesta incorrecta: (no suma ni resta puntos, solo aumenta el número de incorrectas)
      userScores[nicknameUser].incorrectas++;
  }

    // Enviar los Scores actualizados, el número de clics y si ha sido correcta o no
    io.to(salaPartida).emit("nuevas puntuaciones", { userScores: userScores[nicknameUser], username, isCorrecta, clickCounts });

  clickCounts = [0, 0, 0, 0];
});

  // Manejar la desconexión de los usuarios
socket.on('disconnect', function() {
  console.log("¡Desconectado!");
});

  // Volver a jugar (reiniciar puntuaciones...)
socket.on("play again", function(data) {
  const { nicknameAdmin, idRoom, nicknameUser, usersArray } = data;
    console.log("Datos de back to lobby: s", data)

  const userList = usersArray[0].usersArray;
console.log("Lista de id:", userList);

  const usernameList = usersArray[0].usernamesArray;
console.log("Lista de nombres:", usernameList);
  const salaPartida = `partida-${idRoom}`;
  

usersArray[0].usernamesArray.forEach((username) => {
      // Vaciar el objeto de puntuaciones para cada usuario
    userScores[username] = {puntuacion: 0,correctas: 0,incorrectas: 0,};
});

    // Enviar a todos los de la sala un mensaje
  io.to(salaPartida).emit("back to lobby", { nicknameAdmin, idRoom });
  });
  
  // Reiniciar puntuaciones
  socket.on("restart scores", function(data) {
  const { nicknameAdmin, idRoom, usersArray } = data;
 
   const userList = usersArray[0].usersArray;
  console.log("Lista de id:", userList);
 
   const usernameList = usersArray[0].usernamesArray;
  console.log("Lista de nombres:", usernameList);
 
 
  // Suponiendo que usernamesArray contiene los nombres de usuario
 usersArray[0].usernamesArray.forEach((username) => {
      // Vaciar el objeto de puntuaciones para cada usuario
      userScores[username] = {puntuacion: 0,correctas: 0,incorrectas: 0,};
 });
 console.log("scores: ", userScores)
  });
 
});

// Crear una función para generar un código alfanumérico corto
function generarCodigo() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codigo = '';

// Crear una función para generar un código alfanumérico corto
for (let i = 0; i < 4; i++) {
    const indice = Math.floor(Math.random() * caracteres.length);
    codigo += caracteres.charAt(indice);
  }

  return codigo;
}

httpServer.listen(5000, ()=>
  console.log(`Server listening at http://localhost:5000`)
);