const express = require('express')
const cors = require('cors')
const { MongoClient, ObjectId } = require('mongodb')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 5000

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(cors())

const jwtSecretKey = process.env.JWT_SECRETKEY
const uri = process.env.MONGODB_URI
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true })

const generateToken = (user) => {
    return jwt.sign({ id: user._id }, jwtSecretKey, { expiresIn: '1h' })
}

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' })
    }

    jwt.verify(token, process.env.JWT_SECRETKEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token' })
        }

        req.user = decoded
        next()
    })
}


const connectToDatabase = async () => {
    try {
        await client.connect()
        console.log('Connected to MongoDB')
    }
    catch (error) {
        console.error('Error connecting to MongoDB:', error)
    }
}

app.get('/', (req, res) => {
    res.send('API is running SMOOOOOTHLY')
})


app.post('/api/users/register', async (req, res) => {
    try {
        const {username, email, password} = req.body.user

        const database = client.db('todos-database')
        const collection = database.collection('users')

        const userExist = await collection.findOne({ 'user.email': email })
        if (userExist) {
            return res.status(400).json({ message: 'Email address already exists' })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const newUser = {
            user: {
                'username': username,
                'email': email,
                'password': hashedPassword
            }   
        }

        const result = await collection.insertOne(newUser)

        const token = generateToken(result)

        res.status(201).json({ message: 'User registered successfully', token })
    }
    catch (error) {
        console.error('Error adding user:', error)
        res.sendStatus(500).json({ message: 'Error registering user', error })
    }
})

app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body.user

        const database = client.db('todos-database')
        const collection = database.collection('users')

        const user = await collection.findOne({ 'user.email': email })
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' })
        }

        const isPasswordValid = await bcrypt.compare(password, user.user.password)
        if (!isPasswordValid) {
            res.status(401).json({ message: 'Invalid credentials' })
        }

        const token = generateToken(user)

        res.json({ message: 'Login successful', token })
    }
    catch (error) {
        console.error('Error during login:', error)
        res.sendStatus(500).json({ message: 'Error logging in', error })
    }
})

app.get('/api/users', async (req, res) => {
    try {
        const { email } = req.query
        console.log('email: ', email)
        const database = client.db('todos-database')
        const collection = database.collection('users')

        const user = await collection.findOne({ 'user.email': email })
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' })
        }
        
        const userWithoutPassword = { ...user }
        delete userWithoutPassword.user.password

        console.log('user: ', userWithoutPassword)
        res.json(userWithoutPassword)
    }
    catch (error) {
        console.error('Error getting user details:', error)
        res.status(500).json({ message: 'Error getting user details' })
    }
})

app.put('/api/users-update/:id', verifyToken, async (req, res) => {
    try {
        const id = new ObjectId(req.params.id)
        const userDetails = req.body.userDetails
        console.log(userDetails)
        
        const database = client.db('todos-database')
        const collection = database.collection('users')

        const user = await collection.findOne({ '_id': id })

        const result = await collection.updateOne(
            {_id: id},
            { $set: { user_details: userDetails } }
        )
        
        if (result.matchedCount === 0) {
            return res.status(401).json({ message: 'Invalid credentials' })
        }

        res.sendStatus(200)
    }
    catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error updating user details' })
    }
})

app.post('/api/create-tasks/', verifyToken, async (req, res) => {
    try {
        const userId = req.body.userId
        const task = req.body.task

        if (!userId || !task) {
            return res.status(500).json({ message: 'Invalid data provided' })
        }

        const database = client.db('todos-database')
        const collection = database.collection('tasks')
        
        const result = await collection.insertOne({ userId, task })
         
        if (result.acknowledged) {
            return res.sendStatus(200)
        }
        else {
            console.error('MongoDB Insertion Error')
            return res.status(500).json({ message: 'Failed to insert task' })
        }
    }
    catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error creating task' })
    }
})

app.put('/api/update-task/', verifyToken, async (req, res) => {
    try {
        const taskId = req.body.taskId
        const updatedTask = req.body.task

        const database = client.db('todos-database')
        const collection = database.collection('tasks')

        const filter = {
            _id: new ObjectId(taskId)
        }

        const update = {
            $set: {
                task: updatedTask
            }
        }

        const result = await collection.updateOne(filter, update)

        if (result.modifiedCount === 1) {
            return res.sendStatus(200)
        }
        else {
            return res.status(500).json({ message: 'Failed to update task' })
        }
    }
    catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error updating task' })
    }
})

app.put(`/api/delete/`, verifyToken, async (req, res) => {
    try {
        const taskId = req.body.taskId

        const database = client.db('todos-database')
        const collection = database.collection('tasks')

        const filter = {
            _id: new ObjectId(taskId)
        }

        const update = {
            $set: {
                isDeleted: true
            }
        }

        const result = await collection.updateOne(filter, update)

        if (result.modifiedCount === 1) {
            return res.sendStatus(200)
        }
        else {
            return res.status(500).json({ message: 'Failed to delete task' })
        }        
    }
    catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error delete task' })
    }
})

app.put(`/api/finish/`, verifyToken, async (req, res) => {
    try {
        const taskId = req.body.taskId

        const database = client.db('todos-database')
        const collection = database.collection('tasks')

        const filter = {
            _id: new ObjectId(taskId)
        }

        const update = {
            $set: {
                isFinished: true
            }
        }

        const result = await collection.updateOne(filter, update)

        if (result.modifiedCount === 1) {
            return res.sendStatus(200)
        }
        else {
            return res.status(500).json({ message: 'Failed to finalize task' })
        }        
    }
    catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error finalizing task' })
    }
})



app.get('/api/tasks', async (req, res) => {
    try {
        const { userId } = req.query

        console.log('got userId: ', userId)

        const database = client.db('todos-database')
        const collection = database.collection('tasks')

        const tasks = await collection.find({ 'userId': userId }).toArray()


        if (tasks.length === 0) {
            console.log('tasks are empty!')
            return res.status(404).json({ message: 'No tasks found' })
        }
        
        res.json(tasks)
        console.log('this was a success!')
    }
    catch (error) {
        console.error('Error getting user tasks:', error)
        res.status(500).json({ message: 'Error getting user tasks' })
    }
})



app.listen(PORT, () => {
    console.log(`API listening on PORT ${PORT}`)
    connectToDatabase()
})