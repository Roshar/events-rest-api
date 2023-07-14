import express from 'express';
import mysql from 'mysql2';
import bluebird from 'bluebird';
import cors from 'cors'
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';


const app = express();

app.use(express.json())
app.use(cors())
app.use(express.static('public'))



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
        const [soon, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 1 ORDER BY e.date_event')

        const [last, fields2] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 2 ')

        return res.status(200).json({ soon, last });
    } catch (e) {
        console.log(e.message)
    }
})

app.get('/event/:id', async (req, res) => {

    try {
        const [event, fields1] = await connect.query('SELECT e.id, e.title, e.description, e.category_id, ' +
            'e.organization_id, e.participants_number, DATE_FORMAT(e.date_event,"%d-%m-%Y %H:%i") as date_event,' +
            'e.picture_name, e.event_status, e.location,  e.target_audience ' +
            'FROM events as e ' +
            'WHERE e.id_uniq = ? ',
            [req.params.id])

        const [speakers, fields2] = await connect.query('SELECT sp.id, sp.firstname, sp.surname, sp.patronymic, sp.position, ' +
            'sp.company, sp.avatar FROM speakers as sp INNER JOIN relationship_events_speakers as rel ON sp.id = rel.speakers_id ' +
            'WHERE rel.event_id = ? ',
            [req.params.id])

        const [enrollers, fields3] = await connect.query('SELECT COUNT(id) as amount FROM enrollers WHERE event_id = ? ',
            [req.params.id])
        console.log(speakers)
        return res.json({ event, speakers, enrollers })

    } catch (e) {
        console.log(e.message)
    }
})


app.get('/register/:id', async (req, res) => {
    try {
        const [reg_form, fields1] = await connect.query('SELECT title FROM events WHERE id_uniq = ? AND event_status = 1',
            [req.params.id])
        const [list, fields] = await connect.query('SELECT * FROM area');

        return res.json({ reg_form, list })
    } catch (e) {
        console.log(e.message)
    }
})

app.post('/register',
    body('event_id').notEmpty(),
    body('surname').notEmpty(),
    body('firstname').notEmpty(),
    body('email').isEmail().notEmpty(),
    body('phone').notEmpty(),
    body('position').notEmpty(),
    body('company').notEmpty(),

    async (req, res) => {
        const result = validationResult(req);
        if (result.isEmpty()) {
            const user_id_link = uuidv4()


            try {

                const [email, filelds2] = await connect.query('SELECT email FROM enrollers WHERE event_id = ? AND email = ?', [req.body.event_id, req.body.email]);

                if (email.length > 0) {
                    return res.json({ msg: `Пользователь с таким электронным адресом (${email[0].email}) уже зарегистрирован на данное мероприятие !`, status: 200, errorIsRow: 1 })
                }

                const [row, filelds] = await connect.query('INSERT INTO enrollers ' +
                    '(`event_id`,`surname`,`firstname`,`patronymicw`,`email`,`phone`,`position`,`company`,`area_id`,`uniq_serial_for_link`) ' +
                    'VALUES (?,?,?,?,?,?,?,?,?,?)', [
                    req.body.event_id, req.body.surname, req.body.firstname, req.body.patronymic, req.body.email, req.body.phone, req.body.position, req.body.company,
                    req.body.area_id, user_id_link
                ])

                return res.json({ msg: "Вы успешно зарегистрированы на мероприятие!", user_id_link, status: 200 })
            } catch (e) {

                console.log('ошибка')
                console.log(e)
                return res.json({ msg: "Возникла ошибка при регистрации обратитесь в техподдержку", user_id_link, status: 500, errorIsRow: 1 })
            }
        }

        [
            {
                type: 'field',
                value: '',
                msg: 'Invalid value',
                path: 'company',
                location: 'body'
            }
        ]
        console.log(result.array())
        res.send({ errors: result.array() });

    })

app.get('/admin', async (req, res) => {
    try {
        const [events, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status  ORDER BY e.date_event')
        res.json(events)
    } catch (e) {
        console.log(e.message)
    }
})

app.get('/admin/event/edit/:id', async (req, res) => {
    try {
        const [events, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
            'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, c.cat_name, register_status.title as status FROM events as e ' +
            'INNER JOIN category_events as c ON e.category_id = c.id ' +
            'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.id_uniq = ?  ORDER BY e.date_event', [req.body.id])
        res.json(events)
    } catch (e) {
        console.log(e.message)
    }
})


app.listen(8880, () => {
    console.log('backend')
})

