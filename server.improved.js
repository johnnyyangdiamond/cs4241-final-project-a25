import express from "express"
import path from "path"
import mime from "mime"
import { fileURLToPath } from "url"
import ViteExpress from "vite-express"

const dir  = "src/",
      port = 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(express.json()) 

const appdata = []

const organizeAppData = function() {
  const currentTime = new Date(); 

  appdata.sort((a, b) => {
    const timeA = new Date(`1970-01-01T${a.time_input}:00Z`);
    const timeB = new Date(`1970-01-01T${b.time_input}:00Z`);

    const diffA = Math.abs(currentTime - timeA);
    const diffB = Math.abs(currentTime - timeB);

    return diffB - diffA; 
  });

};

const determinePriority = function(){ 
  const currentTime = new Date(`1970-01-01T${new Date().toTimeString().split(' ')[0]}Z`);

  for (let i = 0; i < appdata.length; i++) {
    const taskTime = new Date(`1970-01-01T${appdata[i].time_input}:00Z`);
    const timeDiff = (taskTime - currentTime) / (1000 * 60);

    if (timeDiff <= 30 && timeDiff >= 0) {
      appdata[i].priority = "High";
    } else if (timeDiff > 30 && timeDiff <= 120) {
      appdata[i].priority = "Medium";
    } else if (timeDiff > 120) {
      appdata[i].priority = "Low";
    }
    else {
      appdata[i].priority = "Expired";
    }
  }
}

const ensureNoDuplicates = function(newTask) {
  return !appdata.some(task => task.task_input === newTask.task_input && task.time_input === newTask.time_input);
}

app.get("/tasks", function(req, res){
  organizeAppData();
  determinePriority();
  res.status(200).json(appdata)
})

app.post("/update-time", function(req, res){
  const parsedData = req.body
  const task = appdata.find(t => t.task_id === parsedData.id);
  if (task) {
    task.time_input = parsedData.time_input;
  }
  organizeAppData();
  determinePriority();
  res.status(200).json(appdata)
})

app.post("/update-name", function(req, res){
  const parsedData = req.body
  const task = appdata.find(t => t.task_id === parsedData.id);
  if (task && typeof parsedData.task_input === "string" && parsedData.task_input.trim() !== "") {
    task.task_input = parsedData.task_input.trim();
  }
  organizeAppData();
  determinePriority();
  res.status(200).json(appdata)
})

app.post("/delete-task", function(req, res){
  const parsedData = req.body
  const taskIndex = appdata.findIndex(t => t.task_id === parsedData.id);
  if (taskIndex !== -1) {
    appdata.splice(taskIndex, 1);
  }
  organizeAppData();
  determinePriority();
  res.status(200).json(appdata)
})

app.post("/submit", function(req, res){
  const parsedData = req.body
  if (ensureNoDuplicates(parsedData)) {
    appdata.push(parsedData);
  }
  organizeAppData();
  determinePriority();
  res.status(200).json(appdata)
})


// Serve the production build in production
// Let ViteExpress handle serving the client in dev (Vite) and prod (dist)
ViteExpress.listen(app, process.env.PORT || port, () => {
  console.log(`Server listening on port ${process.env.PORT || port}`)
})
