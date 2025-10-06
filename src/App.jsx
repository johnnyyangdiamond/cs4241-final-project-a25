import React, { useEffect, useState } from 'react'

function App(){

  // State variables
  const [tasks, setTasks] = useState([])
  const [taskName, setTaskName] = useState("")
  const [taskTime, setTaskTime] = useState("")
  const [counter, setCounter] = useState(0)

  // Fetch tasks from the server
  const fetchTasks = async () => {
    const res = await fetch('/tasks')
    const data = await res.json()
    setTasks(data)
  }

  // Fetch tasks from the server every minute
  useEffect(() => {
    fetchTasks()
    const id = setInterval(fetchTasks, 60000)
    return () => clearInterval(id)
  }, [])


  // Submit a new task to the server
  const submit = async (e) => {
    e.preventDefault()
    const body = { task_input: taskName, time_input: taskTime, task_id: counter }
    const res = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()

    // Update the tasks state
    setTasks(data)
    setCounter(counter + 1)
    setTaskName("")
    setTaskTime("")
  }

  // Delete a task from the server
  const handleDeleteTask = async (taskId) => {
    const res = await fetch('/delete-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId })
    })
    const data = await res.json()
    setTasks(data) // Update the tasks state
  }

  // Update the time of a task from the server
  const handleTimeEdit = async (taskId, newTime, originalTime) => {
    if (!newTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(newTime)) {
      alert('Please enter a valid time in the format HH:MM.')
      fetchTasks()
      return
    }
    const res = await fetch('/update-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, time_input: newTime })
    })
    const data = await res.json()
    setTasks(data)
  }

  // Update the name of a task on the server
  const handleNameEdit = async (taskId, newName, originalName) => {
    const trimmed = (newName || '').trim()
    if (!trimmed) {
      alert('Task name cannot be empty.')
      fetchTasks()
      return
    }
    const res = await fetch('/update-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, task_input: trimmed })
    })
    const data = await res.json()
    setTasks(data)
  }

  // Render the app
  return (
    <div>
      <h1>Daily Tasks</h1>
      <div id="form-description">
        <p>
          Enter your daily tasks along with a time, and they will appear below.
          Delete each one that you complete!
        </p>
        <form id="task-form" onSubmit={submit}>
          {/* Task name input */}
          {/* Use state function to update the task name */}
          <input type="text" id="task-name" placeholder="Task name" required value={taskName} onChange={(e)=>setTaskName(e.target.value)} />
          {/* Task time input */}
          <input type="time" id="task-time" required value={taskTime} onChange={(e)=>setTaskTime(e.target.value)} />
          <button type="submit">Add Task</button>
        </form>
      </div>
      <div id="task-list">
        <table className="task-table">
          <thead>
            <tr>
              {/* Set the table headers */}
              {['Task Name', 'Time', 'Priority'].map(h => (<th key={h} className="task-header">{h}</th>))}
            </tr>
          </thead>
          <tbody>
            {/* Map through the tasks and render the task rows */}
            {tasks.map((task) => (
              <tr key={task.task_id} className="task-row">
                <td className="task-cell">
                  <input
                    defaultValue={task.task_input}  
                    onBlur={(e)=>handleNameEdit(task.task_id, e.target.value, task.task_input)}  // Update the name of the task on the server
                    style={{ textAlign: 'center', background: 'transparent', color: 'inherit', border: 'none', width: '100%' }} 
                  />
                </td>
                <td className="task-cell">
                  {/* Render the task time */}
                  <input
                    defaultValue={task.time_input}
                    onBlur={(e)=>handleTimeEdit(task.task_id, e.target.value, task.time_input)} // Update the time of the task on the server
                    style={{ textAlign: 'center', background: 'transparent', color: 'inherit', border: 'none' }}
                  />
                </td>
                {/* Render the task priority with background color */}
                <td className={`task-cell ${task.priority === 'High' ? 'high-priority' : task.priority === 'Medium' ? 'medium-priority' : task.priority === 'Low' ? 'low-priority' : 'expired-priority'}`}>{task.priority}</td>
                <td>
                  <button className="delete-button task-row" onClick={()=>handleDeleteTask(task.task_id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App

