import express from 'express';
import mysql from 'mysql2';
import bluebird from 'bluebird';
import cors from 'cors'
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer'
import * as bodyParser from "body-parser"
import path from 'path'
import { log } from 'console';
import moment from 'moment';
import jwt from "jsonwebtoken"
import 'dotenv/config'
import ensureToken from './utils/ensureToken.js'


const app = express();

app.use(express.json())
app.use(cors())
app.use(express.static('public'))


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/img/event_images')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + '.jpg')
    },
})

const storage2 = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/img/avatars')
    },
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + '.jpg')
    },
})

const upload = multer({ storage: storage })
const upload2 = multer({ storage: storage2 })


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

app.get('/admin/speakers', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers');
                res.json(speakerList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/speaker/:id', ensureToken, async (req, res) => {
    const id = req.params.id;
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers WHERE id = ?', [
                    id
                ]);
                const [genderList, fields2] = await connect.query('SELECT * FROM gender ');
                speakerList.push(genderList)

                console.log(speakerList)

                res.json(speakerList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/speaker/edit/:id', ensureToken, async (req, res) => {

    const id = req.params.id;
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers WHERE id = ?', [
                    id
                ]);
                const [genderList, fields2] = await connect.query('SELECT * FROM gender ');
                speakerList.push(genderList)

                console.log(speakerList)

                res.json(speakerList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.post('/admin/speaker/edit/:id', ensureToken, upload2.single('file'), async (req, res) => {


    const id = req.body.id;
    const firstname = req.body.firstname;
    const surname = req.body.surname;
    const patronymic = req.body.patronymic;
    const position = req.body.position;
    const company = req.body.company;
    const gender_id = req.body['gender_id'];


    let file = 'default_avater.jpg'

    if (req.file) {
        file = req.file.filename;
    }
    const notif = {}

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {

            try {
                const [udateData, fields2] =
                    await connect.query('UPDATE speakers SET `firstname` = ? , `surname` = ?, `patronymic` = ?,`position` =?, ' +
                        '`company` = ?, `avatar` = ?, `gender_id` = ? WHERE id = ?',
                        [
                            firstname,
                            surname,
                            patronymic,
                            position,
                            company,
                            file,
                            gender_id,
                            id
                        ]);

                if (udateData.affectedRows > 0) {
                    notif.msg = 'Данные успешно изменены!'
                    notif.status = 'success'
                    return res.json(notif)
                }

                notif.msg = 'Не удалось добавить изменения!'
                notif.status = 'danger'

                return res.json(notif)

            } catch (e) {
                notif.msg = 'Ошибка в операции!'
                notif.status = 'danger'

                return res.json(notif)
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/speaker/edit/:id', ensureToken, async (req, res) => {

    const id = req.params.id;
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers WHERE id = ?', [
                    id
                ]);
                const [genderList, fields2] = await connect.query('SELECT * FROM gender ');
                speakerList.push(genderList)

                console.log(speakerList)

                res.json(speakerList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/speaker/add', ensureToken, async (req, res) => {

    console.log('sdsd')

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [genderList, fields2] = await connect.query('SELECT * FROM gender ');

                res.json(genderList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.post('/admin/speaker/add', ensureToken, upload2.single('file'), async (req, res) => {

    const firstname = req.body.firstname;
    const surname = req.body.surname;
    const patronymic = req.body.patronymic;
    const position = req.body.position;
    const company = req.body.company;
    const category_id = req.body.category_id;

    let file = null;

    if (category_id === 1) {
        file = 'man.jpg';
    } else if (category_id === 2) {
        file = 'woman.jpg';
    }

    if (req.file) {
        file = req.file.filename;
    }

    const notif = {}

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [row, filelds] = await connect.query('INSERT INTO speakers ' +
                    '(`firstname`,`surname`,`patronymic`,`position`,`company`,`avatar`,`gender_id`) ' +
                    'VALUES (?,?,?,?,?,?,?)', [
                    firstname,
                    surname,
                    patronymic,
                    position,
                    company,
                    category_id
                ])
                if (row.insertId > 0) {
                    notif.msg = 'Новый спикер успешно добавлен!!'
                    notif.status = 'success'
                    return res.json(notif)
                } else {
                    notif.msg = 'Возникла ошибка, обратитесь к администратору'
                    notif.status = 'danger'
                    return res.json(notif)
                }
            } catch (e) {
                notif.msg = 'Возникла ошибка, обратитесь к администратору' + e.message
                notif.status = 'danger'
                return res.json(notif)
            }
        }
    })

})

app.get('/admin', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [events, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
                    'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e ' +
                    'INNER JOIN category_events as c ON e.category_id = c.id ' +
                    'INNER JOIN register_status ON register_status.id = e.event_status  ORDER BY e.date_event')
                res.json(events)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/event/edit/:id', ensureToken, async (req, res) => {
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {

                const [events, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.description, e.category_id, e.organization_id, DATE_FORMAT(e.date_event, "%Y-%m-%d")as date_event,  DATE_FORMAT(e.date_event, "%h:%i") as  time_event, e.location, e.picture_name, e.target_audience,e.participants_number, e.event_status,' +
                    'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e ' +
                    'INNER JOIN category_events as c ON e.category_id = c.id ' +
                    'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.id_uniq = ? ', [req.params.id])
                const [list, fields2] = await connect.query('SELECT * FROM category_events');
                const [listOrg, fields3] = await connect.query('SELECT * FROM organizations');
                const [speakersList, fields4] = await connect.query('SELECT * FROM speakers');
                const [speakersForEvent, fields5] = await connect.query('SELECT res.id, res.speakers_id, res.event_id, s.firstname, s.surname FROM relationship_events_speakers as res INNER JOIN speakers as s ON res.speakers_id = s.id WHERE res.event_id = ?', [req.params.id]);
                res.json({ events, list, listOrg, speakersList, speakersForEvent })
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

// Update event by id

app.post('/admin/event/edit/:id', ensureToken, upload.single('file'), async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            const data = req.body;
            const title = req.body.title;
            const description = req.body.description;
            const category_id = req.body['category_id'];
            const organization_id = req.body['organization_id'];
            const location = req.body['location'];
            const target_audience = req.body['target_audience'];
            const participants_number = req.body['participants_number'];
            const event_status = req.body['event_status'];
            const id = req.body['id'];
            const date_event = req.body['date_event'];
            const date_time = req.body['date_time'];
            const published = req.body['published'];
            const speakers = JSON.parse(req.body['speakersCurrent']);

            let file = 'event_bg.jpg'

            if (req.file) {
                file = req.file.filename;
            }

            const eventDt = date_event + ' ' + date_time;
            const notif = {}
            try {
                const countOperation = []
                const [checkRow, fields] = await connect.query('SELECT id FROM events WHERE id_uniq = ?', [data.id]);

                if (checkRow.length > 0) {
                    const [udateData, fields2] =
                        await connect.query('UPDATE events SET `title` = ? , `description` = ?, `category_id` = ?,`organization_id` =?, ' +
                            '`date_event` = ?, `location` = ?,`target_audience` = ?, `participants_number` = ?, `picture_name` = ?, `event_status` = ?, `published` = ?  WHERE id_uniq = ?',
                            [title, description, category_id, organization_id, eventDt, location, target_audience, participants_number, file, event_status, published, id]);


                    if (udateData.affectedRows > 0) {
                        const [speakersDel, fields4] = await connect.query('DELETE FROM relationship_events_speakers WHERE `event_id` = ?', [
                            id
                        ])
                        for (let i = 0; i < speakers.length; i++) {
                            const [speakerRow, fields] = await connect.query('INSERT INTO relationship_events_speakers (`event_id`,`speakers_id`) VALUES (?,?)', [
                                id,
                                speakers[i]['speakers_id']
                            ])
                            countOperation.push(speakerRow.affectedRows)
                        }

                        if (countOperation.length > 0) {
                            notif.msg = 'Данные успешно изменены!'
                            notif.status = 'success'
                        } else {
                            notif.msg = 'Данные изменены лишь частично, обратитесь к администратору'
                            notif.status = 'danger'
                        }

                        return res.json(notif)
                    } else {
                        notif.msg = 'При обновлении возникла ошибка, обратитесь к администратору'
                        notif.status = 'danger'
                        return res.json(notif)
                    }

                } else {
                    notif.msg = 'Такой материал не найден! Обратитесь к администратору'
                    notif.status = 'danger'
                    return res.json(notif)
                }

            } catch (e) {
                notif.msg = 'Ошибка операции'
                notif.status = 'danger'
                console.log(e)
                return res.json(notif)
            }
        }
    })


})

app.get('/admin/event/add', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [speakers, fields] = await connect.query('SELECT * FROM speakers');
                const [cat, fields2] = await connect.query('SELECT * FROM category_events');
                const [organizations, fields3] = await connect.query('SELECT * FROM organizations');
                return res.json({ speakers, cat, organizations })
            } catch (e) {
                return res.json(e.message)
            }
        }
    })

})

app.post('/admin/event/add', ensureToken, upload.single('file'), async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            let body = JSON.parse(req.body.event);

            const title = body['title']
            const description = body['description']
            const category_id = body['category_id']
            const organization_id = body['organization_id']
            const date_event = body['date_event']
            const time_event = body['time_event']
            const location = body['location']
            const target_audience = body['target_audience']
            const participants_number = body['participants_number']
            const event_status = body['event_status'] ? body['event_status'] : 1
            const published = body['published'] ? body['published'] : 1


            const eventDt = date_event + ' ' + time_event;
            const event_uniq = uuidv4()

            const speakers = body['speakers']

            let file = 'event_bg.jpg'

            if (req.file) {
                file = req.file.filename;
            }

            const notif = {}
            try {
                const [row, filelds] = await connect.query('INSERT INTO events ' +
                    '(`id_uniq`,`title`,`description`,`category_id`,`organization_id`,`date_event`,`location`,`target_audience`,`participants_number`,`picture_name`,`event_status`,`author`,`published`) ' +
                    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                    event_uniq,
                    title,
                    description,
                    category_id,
                    organization_id,
                    eventDt,
                    location,
                    target_audience,
                    participants_number,
                    file,
                    event_status,
                    'admin',
                    published
                ])

                if (row.insertId > 0) {
                    notif.msg = 'Мероприятие успешно добавлено!!'
                    notif.status = 'success'
                    const countOperation = []
                    for (let i = 0; i < speakers.length; i++) {
                        const [speakerRow, fields] = await connect.query('INSERT INTO relationship_events_speakers (`event_id`,`speakers_id`) VALUES (?,?)', [
                            event_uniq,
                            speakers[i]['id']
                        ])
                        countOperation.push(speakerRow.affectedRows)
                    }
                    // console.log(countOperation)
                    if (countOperation.length > 0)
                        return res.json(notif)
                    return false
                } else {
                    notif.msg = 'При обновлении возникла ошибка, обратитесь к администратору'
                    notif.status = 'danger'
                    return res.json(notif)
                }

            } catch (e) {
                notif.msg = 'Ошибка при добавлении материала, обратитесь к администратору'
                notif.status = 'danger'
                console.log(e.message)
                return res.json(notif)
            }
        }
    })



})

// Admin user

app.get('/login', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {

            try {
                const [checkRow, fields] = await connect.query('SELECT * FROM users')
                return res.json(checkRow)
            } catch (e) {
                console.log(e.message)
            }

        } else {

            res.json({
                code: 301
            })
        }
    })


})

app.post('/login', upload.single('file'), async (req, res) => {
    const login = req.body?.login
    const password = req.body?.password
    console.log(login)
    console.log(password)
    let token = null;
    const notif = {}
    try {
        const [checkUser, fileds] = await connect.query('SELECT id FROM users WHERE `login` = ? AND `password` = ?', [
            login, password
        ])
        if (checkUser.length > 0) {
            token = jwt.sign(checkUser[0]['id'], process.env.SECRET_KEY);
            notif.msg = process.env.WELCOME_MSG_RU
            notif.status = 'success'
            notif.token = token
            return res.json(notif)
        }
        notif.msg = process.env.LOGIN_MSG_WRONG
        notif.status = 'danger'
        return res.json(notif)

    } catch (e) {
        console.log(e.message)
    }
})

app.listen(8880, () => {
    console.log('backend')
})

