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

// REGISTRATION

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
    body('experience').notEmpty(),

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
                    '(`event_id`,`surname`,`firstname`,`patronymicw`,`email`,`phone`,`position`,`company`,`experience`,`area_id`,`uniq_serial_for_link`) ' +
                    'VALUES (?,?,?,?,?,?,?,?,?,?)', [
                    req.body.event_id, req.body.surname, req.body.firstname, req.body.patronymic, req.body.email, req.body.phone, req.body.position, req.body.company, req.body.experience,
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

// ADMIN PANEL

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


// SPEAKERS

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
    console.log('ededddedddddd')
    const id = req.params.id;
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const notif = {}
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers WHERE id = ?', [
                    id
                ]);

                if (speakerList.length > 0) {
                    const [genderList, fields2] = await connect.query('SELECT * FROM gender ');
                    speakerList.push(genderList)
                } else {
                    notif.msg = 'Такой пользователь не найден!'
                    notif.status = 'success'
                    notif.code = 204
                    return res.json(notif)
                }

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
                const notif = {}
                const [speakerList, fields] = await connect.query('SELECT * FROM speakers WHERE id = ?', [
                    id
                ]);
                if (speakerList.length > 0) {
                    const [genderList, fields2] = await connect.query('SELECT * FROM gender ');
                    speakerList.push(genderList)
                } else {
                    notif.msg = 'Такой пользователь не найден!'
                    notif.status = 'success'
                    return res.json(
                        notif
                    )
                }



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


    let file = req.body.avatar;

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

app.get('/admin/speaker/delete/:id', ensureToken, async (req, res) => {
    const id = req.params.id;


    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const notif = {}
                const [checkSpeakerDel, fields2] = await connect.query('SELECT id FROM speakers WHERE id = ?', [
                    id
                ])
                if (checkSpeakerDel.length > 0) {
                    const [checkSpeakerWithEvent, fields3] = await connect.query('SELECT id FROM relationship_events_speakers WHERE speakers_id = ?', [
                        id
                    ])
                    if (checkSpeakerWithEvent.length > 0) {
                        notif.msg = 'Не удалось удалить пользовталея! Данный пользователь записан как спикер на мероприятие!'
                        notif.status = 'danger'
                        return res.json(notif)
                    } else {
                        const [speakerList, fields] = await connect.query('DELETE FROM speakers WHERE id = ?', [
                            id
                        ]);
                        if (speakerList.affectedRows > 0) {
                            notif.msg = 'Пользователь удален!'
                            notif.status = 'success'

                            return res.json(notif)
                        }

                        notif.msg = 'Не удалось удалить пользовталея! Обратитесь к администратору!'
                        notif.status = 'danger'
                        return res.json(notif)
                    }

                } else {
                    notif.msg = 'Такой пользователь не найден!'
                    notif.status = 'danger'
                    return res.json(notif)
                }


            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/speaker', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [genderList, fields2] = await connect.query('SELECT * FROM gender');

                res.json(genderList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.post('/admin/speaker/add', ensureToken, upload2.single('file'), async (req, res) => {

    let body = JSON.parse(req.body.speaker);
    console.log('ffff')
    console.log(body)
    console.log(req.file)
    const firstname = body.firstname;
    const surname = body.surname;
    const patronymic = body.patronymic;
    const position = body.position;
    const company = body.company;
    const category_id = body.category_id ? body.category_id : 1;


    let file = '';

    if (parseInt(category_id) === 1) {
        file = 'man.jpg';
    }
    else if (parseInt(category_id) === 2) {
        file = 'woman.jpg';
    }


    if (req.file) {
        console.log('tuta')
        file = req.file.filename;
    }


    console.log(category_id)
    console.log(file)

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
                    file,
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


// EVENTS ADMIN


app.get('/admin/event/edit/:id', ensureToken, async (req, res) => {
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {

                const [events, fields] = await connect.query('SELECT e.id,e.id_uniq, e.title, e.description, e.category_id, e.organization_id, e.center_id, DATE_FORMAT(e.date_event, "%Y-%m-%d")as date_event,  DATE_FORMAT(e.date_event, "%h:%i") as  time_event, e.location, e.picture_name, e.target_audience,e.participants_number, e.event_status,' +
                    'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e ' +
                    'INNER JOIN category_events as c ON e.category_id = c.id ' +
                    'INNER JOIN register_status ON register_status.id = e.event_status WHERE e.id_uniq = ? ', [req.params.id])
                const [list, fields2] = await connect.query('SELECT * FROM category_events');
                const [listOrg, fields3] = await connect.query('SELECT * FROM organizations');
                const [speakersList, fields4] = await connect.query('SELECT * FROM speakers');
                const [centers, fields6] = await connect.query('SELECT * FROM centers');
                const [speakersForEvent, fields5] = await connect.query('SELECT res.id, res.speakers_id, res.event_id, s.firstname, s.surname FROM relationship_events_speakers as res INNER JOIN speakers as s ON res.speakers_id = s.id WHERE res.event_id = ?', [req.params.id]);
                res.json({ events, list, listOrg, speakersList, speakersForEvent, centers })
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})


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
            const center_id = req.body['center_id'] ? req.body['center_id'] : null;
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
                        await connect.query('UPDATE events SET `title` = ? , `description` = ?, `category_id` = ?,`organization_id` =?, `center_id` =?,' +
                            '`date_event` = ?, `location` = ?,`target_audience` = ?, `participants_number` = ?, `picture_name` = ?, `event_status` = ?, `published` = ?  WHERE id_uniq = ?',
                            [title, description, category_id, organization_id, center_id, eventDt, location, target_audience, participants_number, file, event_status, published, id]);


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
                const [centers, fields4] = await connect.query('SELECT * FROM centers');
                const [organizations, fields3] = await connect.query('SELECT * FROM organizations');
                return res.json({ speakers, cat, organizations, centers })
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
            let organization_id = JSON.parse(req.body.organizationId);
            let center_id = JSON.parse(req.body.centerId) ? JSON.parse(req.body.centerId) : ''




            const title = body['title']
            const description = body['description']
            const category_id = body['category_id']

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
                    '(`id_uniq`,`title`,`description`,`category_id`,`organization_id`,`center_id`,`date_event`,`location`,`target_audience`,`participants_number`,`picture_name`,`event_status`,`author`,`published`) ' +
                    'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
                    event_uniq,
                    title,
                    description,
                    category_id,
                    organization_id,
                    center_id,
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

// USERS enrollers

app.get('/admin/enrollers', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [usersList, fields] = await connect.query('SELECT  e.id, e.surname , e.firstname, e.email,' +
                    'e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM ' +
                    'enrollers as e INNER JOIN area as a ON e.area_id = a.id_area ' +
                    'INNER JOIN events as event ON e.event_id = event.id_uniq');
                res.json(usersList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/enroller/:id', ensureToken, async (req, res) => {


    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [usersList, fields] = await connect.query('SELECT  e.id, e.surname , e.firstname,e.patronymic, e.email,' +
                    'e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM ' +
                    'enrollers as e INNER JOIN area as a ON e.area_id = a.id_area ' +
                    'INNER JOIN events as event ON e.event_id = event.id_uniq WHERE e.uniq_serial_for_link = ?', [
                    req.params.id
                ]);
                res.json(usersList)
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.get('/admin/enroller/delete/:id', ensureToken, async (req, res) => {
    const id = req.params.id;


    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const notif = {}
                const [checkEnrollerDel, fields2] = await connect.query('SELECT id FROM enrollers WHERE uniq_serial_for_link = ?', [
                    id
                ])
                if (checkEnrollerDel.length > 0) {
                    const [enrroler, fields] = await connect.query('DELETE FROM enrollers WHERE uniq_serial_for_link = ?', [
                        id
                    ]);
                    if (enrroler.affectedRows > 0) {
                        notif.msg = 'Пользователь удален!'
                        notif.status = 'success'

                        return res.json(notif)
                    }

                    notif.msg = 'Не удалось удалить пользовталея! Обратитесь к администратору!'
                    notif.status = 'danger'
                    return res.json(notif)

                } else {
                    notif.msg = 'Такой пользователь не найден!'
                    notif.status = 'danger'
                    return res.json(notif)
                }


            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

// USER ADMIN

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


// REPORTS
app.get('/admin/report', ensureToken, async (req, res) => {

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
            res.json({
                code: 403
            })
        } else {
            try {
                const [events, fields] = await connect.query('SELECT COUNT(id) as count FROM events');
                const [enrollers, fields2] = await connect.query('SELECT COUNT(id) as count FROM enrollers');
                const [speakers, fields3] = await connect.query('SELECT COUNT(id) as count FROM speakers');
                const [categories, fields4] = await connect.query('SELECT * FROM category_events');
                const [organizations, fields5] = await connect.query('SELECT * FROM organizations');
                const [centers, fields6] = await connect.query('SELECT * FROM centers');
                res.json({ events, enrollers, speakers, categories, organizations, centers })
            } catch (e) {
                console.log(e.message)
            }
        }
    })

})

app.post('/admin/report/events', ensureToken, upload.single('file'), async (req, res) => {
    const eventData = {}
    if (req.body.event.length > 0) {
        console.log('fffffff')
        let body = JSON.parse(req.body.event);
        const notif = {}

        console.log('start ' + body.centerId)

        const year = body.year === 'all' ? " " : ' = ' + body.year;
        const month = body.month === 'all' ? " " : ' = ' + body.month;
        const categoryId = body.categoryId == 'all' ? " " : ' = ' + body.categoryId;
        const organizationId = body.organizationId == 'all' ? " " : ' = ' + body.organizationId;
        const centerId = body.centerId === "all" ? " " : ' = ' + body.centerId
        const actual = body.actual;

        const ryear = body.year === 'all' ? "не указано" : body.year;
        const rmonth = body.month === 'all' ? "не указано" : body.month;
        const rcategoryId = body.categoryId == 'all' ? "не указано" : body.categoryId;
        const rorganizationId = body.organizationId == 'all' ? "не указано " : body.organizationId;
        const rcenterId = body.centerId === "all" ? "не указано" : body.centerId

        eventData.year = ryear
        eventData.month = rmonth
        eventData.categoryId = rcategoryId
        eventData.organizationId = rorganizationId
        eventData.centerId = rcenterId
        eventData.actual = actual


        jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
            if (err) {

                notif.code = 403
                res.json(notif)
            } else {
                console.log('here')
                try {

                    const sql = `SELECT COUNT(*) as count FROM events as e
                    WHERE e.category_id ${categoryId} AND e.organization_id ${organizationId} 
                    AND MONTH(e.date_event) ${month}  AND YEAR(e.date_event) ${year}
                    AND e.event_status = ${actual} AND e.center_id ${centerId} `

                    const [amountRows, filelds] = await connect.query(sql)

                    if (amountRows.length > 0) {
                        eventData.count = amountRows[0]['count']
                        notif.code = 200;
                        notif.msg = 'Получена статистка!'
                        notif.status = 'success'
                        notif.result = eventData
                        return res.json(notif)
                    }

                    notif.msg = 'Не удалось добавить изменения!'
                    notif.status = 'danger'

                    return res.json(notif)



                } catch (e) {
                    console.log(e.message)
                    notif.msg = 'Возникла ошибка, обратитесь к администратору' + e.message
                    notif.status = 'danger'
                    return res.json(notif)
                }
            }
        })
    }











})


app.post('/admin/report/enrollers', ensureToken, upload.single('file'), async (req, res) => {
    const eventData = {}
    if (req.body.event.length > 0) {

        let body = JSON.parse(req.body.event);
        const notif = {}

        const year = body.year === 'all' ? " " : ' = ' + body.year;
        const month = body.month === 'all' ? " " : ' = ' + body.month;
        const categoryId = body.categoryId == 'all' ? " " : ' = ' + body.categoryId;
        const organizationId = body.organizationId == 'all' ? " " : ' = ' + body.organizationId;
        const centerId = body.centerId === "all" ? " " : ' = ' + body.centerId
        const actual = body.actual;

        const ryear = body.year === 'all' ? "не указано" : body.year;
        const rmonth = body.month === 'all' ? "не указано" : body.month;
        const rcategoryId = body.categoryId == 'all' ? "не указано" : body.categoryId;
        const rorganizationId = body.organizationId == 'all' ? "не указано " : body.organizationId;
        const rcenterId = body.centerId === "all" ? "не указано" : body.centerId

        eventData.year = ryear
        eventData.month = rmonth
        eventData.categoryId = rcategoryId
        eventData.organizationId = rorganizationId
        eventData.centerId = rcenterId
        eventData.actual = actual



        jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
            if (err) {

                notif.code = 403
                res.json(notif)
            } else {

                try {

                    const sql = `SELECT COUNT(*) as count FROM enrollers as en 
                    INNER JOIN events as e ON en.event_id = e.id_uniq  WHERE e.category_id ${categoryId}
                    AND e.organization_id ${organizationId} AND MONTH(e.date_event) ${month}  AND YEAR(e.date_event) ${year}
                    AND e.event_status = ${actual} AND e.center_id ${centerId} `

                    const [amountRows, filelds] = await connect.query(sql)

                    console.log(amountRows)

                    if (amountRows.length > 0) {
                        eventData.count = amountRows[0]['count']
                        notif.code = 200;
                        notif.msg = 'Получена статистка!'
                        notif.status = 'success'
                        notif.result = eventData
                        return res.json(notif)
                    }

                    notif.msg = 'Не удалось получить статистику!'
                    notif.status = 'danger'

                    return res.json(notif)



                } catch (e) {
                    console.log(e.message)
                    notif.msg = 'Возникла ошибка, обратитесь к администратору' + e.message
                    notif.status = 'danger'
                    return res.json(notif)
                }
            }
        })
    }











})
app.listen(8880, () => {
    console.log('backend')
})

