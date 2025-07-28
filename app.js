const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log(`Server is running at http://localhost:3000`)
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertStateObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

const convertDistrictObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

//middleware functions
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//login api
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const dbUser = await db.get(selectUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatch === true) {
      //response.send('Login success')
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//get states api
app.get('/states', authenticateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state;`
  const statesArray = await db.all(getStatesQuery)
  response.send(
    statesArray.map(state => convertStateObjectToResponseObject(state)),
  )
})

//get states with stateId
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`
  const state = await db.get(getStateQuery)
  response.send(convertStateObjectToResponseObject(state))
})

//create new districts with post method
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const createDistrictQuery = `INSERT INTO 
  district (state_id, district_name, cases, cured, active, deaths)
  VALUES (
    ${stateId},
    '${districtName}',
    ${cases},
    ${cured},
    ${active},
    ${deaths}
  );`

  await db.run(createDistrictQuery)
  response.send('District Successfully Added')
})

//get districts with districtId
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`
    const districtArray = await db.get(getDistrictQuery)
    response.send(convertDistrictObjectToResponseObject(districtArray))
  },
)

//api for delete with Id
app.delete(
  '/districts/:districtId',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `
      DELETE FROM district WHERE district_id = ${districtId};`
    await db.run(deleteDistrictQuery)
    response.send('District Removed')
  },
)

//update specific details for we use put method
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
      UPDATE district SET
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
      WHERE district_id = ${districtId};`
    await db.run(updateDistrictQuery)
    response.send('District Details Updated')
  },
)

//stats of states
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStateStatsQuery = `
      SELECT 
        SUM(cases) AS totalCases,
        SUM(cured) AS totalCured,
        SUM(active) AS totalActive,
        SUM(deaths) AS totalDeaths
      FROM district WHERE state_id = ${stateId};`

    const stats = await db.get(getStateStatsQuery)
    response.send(stats)
  },
)

module.exports = app
