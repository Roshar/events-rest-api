import express from 'express';
import mysql from 'mysql2';
import bluebird from 'bluebird';
import cors from 'cors'


const app = express();

app.use(express.json())
app.use(cors())
app.use(express.static('public'))

// const connect = await mysql.createConnection({
//     host: 'localhost',
//     user: 'root',
//     password: 'root',
//     database: 'govzalla_events',
//     port: 8889
// })

const pool = await mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'govzalla_events',
    port: 8889
})

const connect = pool.promise();



app.get('/events', async (req, res) => {

    try {
        const [soon, fields] = await connect.query('SELECT e.id, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 1 ORDER BY e.date_event')

        const [last, fields2] = await connect.query('SELECT e.id, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 2 ')

        return res.json({ soon, last });
    } catch (e) {
        console.log(e.message)
    }
})

app.get('/event/:id', async (req, res) => {
    try {
        const [rows, fields] = await connect.query('SELECT id, title, description, category_id, organization_id,participants_number, DATE_FORMAT(date_event,"%d-%m-%Y %H:%i") as date_event, picture_name, event_status, speakers, location, target_audience FROM events WHERE id = ?', [req.params.id])
        // console.log(rows)
        return res.json(rows)

    } catch (e) {
        console.log(e.message)
    }
})

app.listen(8880, () => {
    console.log('backend')
})
