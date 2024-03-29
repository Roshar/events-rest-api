import express from "express";
import mysql from "mysql2";
import bluebird from "bluebird";
import cors from "cors";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import * as bodyParser from "body-parser";
import path from "path";
import { log } from "console";
import moment from "moment";
import jwt from "jsonwebtoken";
import "dotenv/config";
import ensureToken from "./utils/ensureToken.js";

const PORT = process.env.PORT || 8080;

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/img/event_images");
    console.log("storage");
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now() + ".jpg");
  },
  onError: function (err, next) {
    console.log("error", err);
    next(err);
  },
});

const storage2 = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("storage2");
    cb(null, "public/img/avatars");
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now() + ".jpg");
  },
  onError: function (err, next) {
    console.log("error", err);
    next(err);
  },
});

const upload = multer({ storage: storage });
const upload2 = multer({ storage: storage2 });

const pool = await mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE,
  port: process.env.DATABASE_PORT,
  socketPath: process.env.SOCKET,
});

const connect = pool.promise();

app.get("/test", async (req, res) => {
  const result = [
    {
      id: 1,
      name: "Ddddd",
    },
    {
      id: 2,
      name: "Ddddd",
    },
    {
      id: 3,
      name: "Ddddd",
    },
  ];
  return res.status(200).json(result);
});

app.get("/events", async (req, res) => {
  try {
    const [soon, fields] = await connect.query(
      'SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
        "c.cat_name, register_status.title as status FROM events as e " +
        "INNER JOIN category_events as c ON e.category_id = c.id " +
        "INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 1 ORDER BY e.date_event LIMIT 4"
    );

    const [last, fields2] = await connect.query(
      'SELECT e.id,e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,' +
        "c.cat_name, register_status.title as status FROM events as e " +
        "INNER JOIN category_events as c ON e.category_id = c.id " +
        "INNER JOIN register_status ON register_status.id = e.event_status WHERE e.event_status = 2 LIMIT 4"
    );

    const [orgList, fields3] = await connect.query(
      `SELECT * FROM organizations`
    );

    return res.status(200).json({ soon, last, orgList });
  } catch (e) {
    console.log(e.message);
  }
});

app.get("/events/getsearchresult/:params", async (req, res) => {
  let params = req.params.params;

  try {
    const [result, fields] = await connect.query(
      `SELECT id_uniq, title FROM events WHERE title LIKE '${params}%' LIMIT 10`
    );

    console.log(result);

    return res.status(200).json(result);
  } catch (e) {
    console.log(e.message);
  }
});

app.get("/event/:id", async (req, res) => {
  try {
    const [event, fields1] = await connect.query(
      `SELECT e.id, e.title, e.description, e.category_id, 
            e.organization_id, e.participants_number, DATE_FORMAT(e.date_event,"%d-%m-%Y %H:%i") as date_event,
            e.picture_name,additional_link, e.event_status, e.location, e.target_audience 
            FROM events as e 
            WHERE e.id_uniq = ?`,
      [req.params.id]
    );

    console.log(event);

    const [
      speakers,
      fields2,
    ] = await connect.query(
      "SELECT sp.id, sp.firstname, sp.surname, sp.patronymic, sp.position, " +
        "sp.company, sp.avatar FROM speakers as sp INNER JOIN relationship_events_speakers as rel ON sp.id = rel.speakers_id " +
        "WHERE rel.event_id = ? ",
      [req.params.id]
    );

    const [
      enrollers,
      fields3,
    ] = await connect.query(
      "SELECT COUNT(id) as amount FROM enrollers WHERE event_id = ? ",
      [req.params.id]
    );
    console.log(speakers);
    return res.json({ event, speakers, enrollers });
  } catch (e) {
    console.log(e.message);
  }
});

app.get("/events/cat/:filters", async (req, res) => {
  console.log(req.params);
  const params = JSON.parse(req.params.filters);

  const year = params.year ? ` AND YEAR(e.date_event) = ${params.year} ` : "";
  const month = params.month
    ? ` AND MONTH(e.date_event) = ${params.month} `
    : "";
  const category = params.category
    ? `AND e.category_id = ${params.category} `
    : "";
  const org = params.org ? ` AND e.organization_id = ${params.org} ` : "";
  const offset = params.offset != 0 ? ` OFFSET ${params.offset} ` : `OFFSET 0`;
  const limit = ` LIMIT ${params.limit == 0 ? 4 : params.limit} `;

  try {
    console.log("in block try");
    const sql = `
        SELECT e.id,e.id_uniq, e.title, e.category_id, 
        DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, 
        e.picture_name, e.event_status, o.name as org_name,
        c.cat_name, register_status.title as status FROM events as e  
        INNER JOIN category_events as c ON e.category_id = c.id
        INNER JOIN register_status ON register_status.id = e.event_status 
        INNER JOIN organizations as o ON e.organization_id = o.id 
        WHERE e.event_status = 1 ${org} ${category} ${year} ${month} ORDER BY
         e.date_event  ${limit}  ${offset} `;

    console.log(sql);

    const [soon, fileds] = await connect.query(sql);
    console.log(soon);

    if (org !== "") {
      const sql = `SELECT id, name FROM organizations WHERE id = ${params.org}`;
      const [orgReult, fileds] = await connect.query(sql);
      return res.json({ soon, orgReult });
    }

    return res.json({ soon });
  } catch (e) {
    console.log(e.message);
  }
});

app.get("/events/cat/last/:filters", async (req, res) => {
  const params = JSON.parse(req.params.filters);

  const year = params.year ? ` AND YEAR(e.date_event) = ${params.year} ` : "";
  const month = params.month
    ? ` AND MONTH(e.date_event) = ${params.month} `
    : "";
  const category = params.category
    ? `AND e.category_id = ${params.category} `
    : "";
  const org = params.org ? ` AND e.organization_id = ${params.org} ` : "";
  const offset = params.offset != 0 ? ` OFFSET ${params.offset} ` : `OFFSET 0`;
  const limit = ` LIMIT ${params.limit} `;

  try {
    const sql = `
        SELECT e.id,e.id_uniq, e.title, e.category_id, 
        DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, 
        e.picture_name, e.event_status,
        c.cat_name, register_status.title as status FROM events as e 
        INNER JOIN category_events as c ON e.category_id = c.id
        INNER JOIN register_status ON register_status.id = e.event_status 
        WHERE e.event_status = 2 ${org} ${category}  ${year} ${month} ORDER BY 
        e.date_event  ${limit}  ${offset}`;

    const [last, fileds] = await connect.query(sql);

    if (org !== "") {
      const sql = `SELECT id, name FROM organizations WHERE id = ${params.org}`;
      const [orgReult, fileds] = await connect.query(sql);
      return res.json({ last, orgReult });
    }

    return res.json({ last });
  } catch (e) {
    console.log(e.message);
  }
});

// REGISTRATION

app.get("/register/:id", async (req, res) => {
  try {
    const [
      reg_form,
      fields1,
    ] = await connect.query(
      "SELECT title FROM events WHERE id_uniq = ? AND event_status = 1",
      [req.params.id]
    );
    const [list, fields] = await connect.query("SELECT * FROM area");

    return res.json({ reg_form, list });
  } catch (e) {
    console.log(e.message);
  }
});

app.post(
  "/register",
  body("event_id").notEmpty(),
  body("surname").notEmpty(),
  body("firstname").notEmpty(),
  body("email").isEmail().notEmpty(),
  body("phone").notEmpty(),
  body("position").notEmpty(),
  body("company").notEmpty(),
  body("experience").notEmpty(),

  async (req, res) => {
    const result = validationResult(req);

    if (result.isEmpty()) {
      const user_id_link = uuidv4();
      try {
        const [
          email,
          filelds2,
        ] = await connect.query(
          "SELECT email FROM enrollers WHERE event_id = ? AND email = ?",
          [req.body.event_id, req.body.email]
        );
        if (email.length > 0) {
          return res.json({
            msg: `Пользователь с таким электронным адресом (${email[0].email}) уже зарегистрирован на данное мероприятие !`,
            status: 402,
            errorIsRow: 1,
          });
        }
        const [
          limitRow,
          fields3,
        ] = await connect.query(
          `SELECT limit_enrollers, participants_number FROM events WHERE id_uniq = ?`,
          [req.body.event_id]
        );

        if (limitRow[0]["limit_enrollers"] === null) {
          const [row, filelds] = await connect.query(
            "INSERT INTO enrollers " +
              "(`event_id`,`surname`,`firstname`,`patronymic`,`email`,`phone`,`position`,`company`,`experience`,`area_id`,`uniq_serial_for_link`) " +
              "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [
              req.body.event_id,
              req.body.surname,
              req.body.firstname,
              req.body.patronymic,
              req.body.email,
              req.body.phone,
              req.body.position,
              req.body.company,
              req.body.experience,
              req.body.area_id,
              user_id_link,
            ]
          );
          return res.json({
            msg: "Вы успешно зарегистрированы на мероприятие!",
            user_id_link,
            status: 200,
          });
        } else if (limitRow[0]["limit_enrollers"] !== null) {
          const [
            countEnrollers,
            fields3,
          ] = await connect.query(
            `SELECT COUNT(id) as count FROM enrollers WHERE event_id = ?`,
            [req.body.event_id]
          );
          if (
            countEnrollers[0]["count"] + 1 <
            limitRow[0]["participants_number"]
          ) {
            const [
              row,
              filelds,
            ] = await connect.query(
              "INSERT INTO enrollers " +
                "(`event_id`,`surname`,`firstname`,`patronymic`,`email`,`phone`,`position`,`company`,`experience`,`area_id`,`uniq_serial_for_link`) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
              [
                req.body.event_id,
                req.body.surname,
                req.body.firstname,
                req.body.patronymic,
                req.body.email,
                req.body.phone,
                req.body.position,
                req.body.company,
                req.body.experience,
                req.body.area_id,
                user_id_link,
              ]
            );
            return res.json({
              msg: "Вы успешно зарегистрированы на мероприятие!",
              user_id_link,
              status: 200,
            });
          } else {
            return res.json({
              msg: `Ограничение на количество участников! К сожалению, Вы не можете зарегистрироваться из-за  ограничений на количество учаcтников на данное мероприятие `,
              status: 402,
              errorIsRow: 1,
            });
          }
        }
      } catch (e) {
        console.log("ошибка");
        console.log(e);
        return res.json({
          msg: "Возникла ошибка при регистрации обратитесь в техподдержку",
          user_id_link,
          status: 500,
          errorIsRow: 1,
        });
      }
    }

    // [
    //     {
    //         type: 'field',
    //         value: '',
    //         msg: 'Invalid value',
    //         path: 'company',
    //         location: 'body'
    //     }
    // ]
    console.log(result.array());
    res.send({ errors: result.array() });
  }
);

// ADMIN PANEL
app.get("/checkRole", ensureToken, async (req, res) => {
  console.log("checkRole");

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      console.log(err);
      res.json({
        code: 403,
      });
    } else {
      res.json({
        code: 200,
      });
    }
  });
});

app.get("/admin/main/:params", ensureToken, async (req, res) => {
  console.log("sdsd");

  const params = JSON.parse(req.params.params);

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const offset =
          params.firstIndex > 0 ? `OFFSET ${params.firstIndex}` : "";
        const limit = `LIMIT 5`;

        const [
          events,
          fields,
        ] = await connect.query(`SELECT e.id, e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,
                    DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e 
                    INNER JOIN category_events as c ON e.category_id = c.id 
                    INNER JOIN register_status ON register_status.id = e.event_status
                    ORDER BY e.date_event DESC  ${limit} ${offset}`);

        res.json(events);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

// SPEAKERS

app.get("/admin/speakers/:params", ensureToken, async (req, res) => {
  const params = JSON.parse(req.params.params);

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const offset =
          params.firstIndex > 0 ? `OFFSET ${params.firstIndex}` : "";
        const limit = `LIMIT 5`;

        const [speakerList, fields] = await connect.query(
          `SELECT * FROM speakers ORDER BY surname  ${limit} ${offset}`
        );
        res.json(speakerList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/admin/speaker/:id", ensureToken, async (req, res) => {
  console.log("/admin/speaker/:id");

  const id = req.params.id;
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const notif = {};
        const [
          speakerList,
          fields,
        ] = await connect.query("SELECT * FROM speakers WHERE id = ?", [id]);

        if (speakerList.length > 0) {
          const [genderList, fields2] = await connect.query(
            "SELECT * FROM gender "
          );
          speakerList.push(genderList);
        } else {
          notif.msg = "Такой пользователь не найден!";
          notif.status = "success";
          notif.code = 204;
          return res.json(notif);
        }

        res.json(speakerList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/admin/speaker/edit/:id", ensureToken, async (req, res) => {
  const id = req.params.id;
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const notif = {};
        const [
          speakerList,
          fields,
        ] = await connect.query("SELECT * FROM speakers WHERE id = ?", [id]);
        if (speakerList.length > 0) {
          const [genderList, fields2] = await connect.query(
            "SELECT * FROM gender "
          );
          speakerList.push(genderList);
        } else {
          notif.msg = "Такой пользователь не найден!";
          notif.status = "success";
          return res.json(notif);
        }

        res.json(speakerList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

const upp = upload2.single("file");

app.post("/admin/speaker/edit/:id", ensureToken, async (req, res) => {
  upp(req, res, function (err) {
    if (err) {
      console.log({ message: err });
      return;
    }

    const id = req.body.id;
    const firstname = req.body.firstname;
    const surname = req.body.surname;
    const patronymic = req.body.patronymic;
    const position = req.body.position;
    const company = req.body.company;
    const gender_id = req.body["gender_id"];

    let file = req.body.file;

    if (parseInt(req.body["gender_id"]) === 2 && req.body.file === "man.jpg") {
      file = "woman.jpg";
    } else if (
      parseInt(req.body["gender_id"]) == 1 &&
      req.body.file === "woman.jpg"
    ) {
      file = "man.jpg";
    }

    console.log(file);

    if (req.file) {
      file = req.file.filename;
    }
    const notif = {};

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
      if (err) {
        res.json({
          code: 403,
        });
      } else {
        try {
          const [
            udateData,
            fields2,
          ] = await connect.query(
            "UPDATE speakers SET `firstname` = ? , `surname` = ?, `patronymic` = ?,`position` =?, " +
              "`company` = ?, `avatar` = ?, `gender_id` = ? WHERE id = ?",
            [
              firstname,
              surname,
              patronymic,
              position,
              company,
              file,
              gender_id,
              id,
            ]
          );

          if (udateData.affectedRows > 0) {
            notif.msg = "Данные успешно изменены!";
            notif.status = "success";
            return res.json(notif);
          }

          notif.msg = "Не удалось добавить изменения!";
          notif.status = "danger";

          return res.json(notif);
        } catch (e) {
          notif.msg = "Ошибка в операции!";
          notif.status = "danger";
          console.log(e.message);
          return res.json(notif);
        }
      }
    });
  });
});

app.get("/admin/speaker/edit/:id", ensureToken, async (req, res) => {
  console.log("/admin/speaker/edit/:id");
  const id = req.params.id;
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [
          speakerList,
          fields,
        ] = await connect.query("SELECT * FROM speakers WHERE id = ?", [id]);
        const [genderList, fields2] = await connect.query(
          "SELECT * FROM gender "
        );
        speakerList.push(genderList);

        console.log(speakerList);

        res.json(speakerList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/admin/speaker/delete/:id", ensureToken, async (req, res) => {
  const id = req.params.id;

  console.log("/admin/speaker/delete/:id");
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const notif = {};
        const [
          checkSpeakerDel,
          fields2,
        ] = await connect.query("SELECT id FROM speakers WHERE id = ?", [id]);
        if (checkSpeakerDel.length > 0) {
          const [
            checkSpeakerWithEvent,
            fields3,
          ] = await connect.query(
            "SELECT id FROM relationship_events_speakers WHERE speakers_id = ?",
            [id]
          );
          if (checkSpeakerWithEvent.length > 0) {
            notif.msg =
              "Не удалось удалить пользовталея! Данный пользователь записан как спикер на мероприятие!";
            notif.status = "danger";
            return res.json(notif);
          } else {
            const [
              speakerList,
              fields,
            ] = await connect.query("DELETE FROM speakers WHERE id = ?", [id]);
            if (speakerList.affectedRows > 0) {
              notif.msg = "Пользователь удален!";
              notif.status = "success";

              return res.json(notif);
            }

            notif.msg =
              "Не удалось удалить пользовталея! Обратитесь к администратору!";
            notif.status = "danger";
            return res.json(notif);
          }
        } else {
          notif.msg = "Такой пользователь не найден!";
          notif.status = "danger";
          return res.json(notif);
        }
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/admin/speaker", ensureToken, async (req, res) => {
  console.log("/admin/speaker");

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [genderList, fields2] = await connect.query(
          "SELECT * FROM gender"
        );

        res.json(genderList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.post(
  "/admin/speaker/create",
  ensureToken,
  upload2.single("file"),
  async (req, res) => {
    let body = JSON.parse(req.body.speaker);

    const firstname = body.firstname;
    const surname = body.surname;
    const patronymic = body.patronymic;
    const position = body.position;
    const company = body.company;
    const category_id = body.category_id ? body.category_id : 1;

    let file = "";

    if (parseInt(category_id) === 1) {
      file = "man.jpg";
    } else if (parseInt(category_id) === 2) {
      file = "woman.jpg";
    }

    if (req.file) {
      console.log("tuta");
      file = req.file.filename;
    }

    console.log(category_id);
    console.log(file);

    const notif = {};

    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
      if (err) {
        res.json({
          code: 403,
        });
      } else {
        try {
          const [row, filelds] = await connect.query(
            "INSERT INTO speakers " +
              "(`firstname`,`surname`,`patronymic`,`position`,`company`,`avatar`,`gender_id`) " +
              "VALUES (?,?,?,?,?,?,?)",
            [
              firstname,
              surname,
              patronymic,
              position,
              company,
              file,
              category_id,
            ]
          );
          if (row.insertId > 0) {
            notif.msg = "Новый спикер успешно добавлен!!";
            notif.status = "success";
            return res.json(notif);
          } else {
            notif.msg = "Возникла ошибка, обратитесь к администратору";
            notif.status = "danger";
            return res.json(notif);
          }
        } catch (e) {
          notif.msg =
            "Возникла ошибка, обратитесь к администратору" + e.message;
          notif.status = "danger";
          return res.json(notif);
        }
      }
    });
  }
);

app.post("/admin/speakers/search", async (req, res) => {
  const params = JSON.parse(req.body.params).trim();

  try {
    const sql = `SELECT * FROM speakers WHERE surname LIKE '%${params}%' ORDER BY surname LIMIT 5`;
    console.log(sql);

    const [result, fields] = await connect.query(sql);

    // console.log(result);

    return res.status(200).json(result);
  } catch (e) {
    console.log(e.message);
  }
});

// EVENTS ADMIN

app.get("/admin/event/edit/:id", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [
          events,
          fields,
        ] = await connect.query(
          'SELECT e.id,e.id_uniq, e.title, e.description, e.category_id, e.organization_id, e.center_id, DATE_FORMAT(e.date_event, "%Y-%m-%d")as date_event,  DATE_FORMAT(e.date_event, "%h:%i") as  time_event, e.location, e.picture_name, e.additional_link, e.target_audience,e.participants_number,e.limit_enrollers, e.event_status,' +
            'DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e ' +
            "INNER JOIN category_events as c ON e.category_id = c.id " +
            "INNER JOIN register_status ON register_status.id = e.event_status WHERE e.id_uniq = ? ",
          [req.params.id]
        );
        const [list, fields2] = await connect.query(
          "SELECT * FROM category_events"
        );
        const [listOrg, fields3] = await connect.query(
          "SELECT * FROM organizations"
        );
        const [speakersList, fields4] = await connect.query(
          "SELECT * FROM speakers ORDER BY surname"
        );
        const [centers, fields6] = await connect.query("SELECT * FROM centers");
        const [
          speakersForEvent,
          fields5,
        ] = await connect.query(
          "SELECT res.id, res.speakers_id, res.event_id, s.firstname, s.surname FROM relationship_events_speakers as res INNER JOIN speakers as s ON res.speakers_id = s.id WHERE res.event_id = ?",
          [req.params.id]
        );
        res.json({
          events,
          list,
          listOrg,
          speakersList,
          speakersForEvent,
          centers,
        });
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.post(
  "/admin/event/edit/:id",
  ensureToken,
  upload.single("file"),
  async (req, res) => {
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
      if (err) {
        res.json({
          code: 403,
        });
      } else {
        const data = req.body;
        const title = req.body.title;
        const description = req.body.description;
        const category_id = req.body["category_id"];
        const organization_id = req.body["organization_id"];
        const center_id = req.body["center_id"] ? req.body["center_id"] : 20;
        const location = req.body["location"];
        const target_audience = req.body["target_audience"];
        const participants_number = req.body["participants_number"];
        const event_status = req.body["event_status"];
        const id = req.body["id"];
        const date_event = req.body["date_event"];
        const date_time = req.body["date_time"];
        const published = req.body["published"];
        const additional_link = req.body["additional_link"];

        // const speakers = JSON.parse(req.body["speakersCurrent"]);

        const tmp = JSON.parse(req.body["speakersCurrent"]);

        let tmpArray = [];

        function itemCheck(item) {
          if (tmpArray.indexOf(item.id) === -1) {
            tmpArray.push(item.id);
            return true;
          }
          return false;
        }

        const speakers = tmp.filter((item) => itemCheck(item));

        console.log("---------");
        console.log(speakers);

        let file = null;
        if (req.file) {
          file = req.file.filename;
        }

        const eventDt = date_event + " " + date_time;
        const notif = {};
        try {
          const countOperation = [];
          const [
            checkRow,
            fields,
          ] = await connect.query("SELECT id FROM events WHERE id_uniq = ?", [
            data.id,
          ]);

          if (checkRow.length > 0) {
            let fileSql;
            if (file !== null) {
              fileSql = `picture_name = '${file}',`;
            } else {
              fileSql = "";
            }
            let sql1 = `UPDATE events SET title = '${title}', description = '${description}', category_id = '${category_id}', organization_id = '${organization_id}', center_id ='${center_id}', 
            date_event = '${date_event}', location = '${location}', target_audience = '${target_audience}', participants_number = '${participants_number}', ${fileSql} additional_link = '${additional_link}', event_status = '${event_status}', published = '${published}'  WHERE id_uniq = '${id}'`;
            let [udateData, fields2] = await connect.query(sql1);

            if (udateData.affectedRows > 0) {
              const [
                speakersDel,
                fields4,
              ] = await connect.query(
                "DELETE FROM relationship_events_speakers WHERE `event_id` = ?",
                [id]
              );
              for (let i = 0; i < speakers.length; i++) {
                const [
                  speakerRow,
                  fields,
                ] = await connect.query(
                  "INSERT INTO relationship_events_speakers (`event_id`,`speakers_id`) VALUES (?,?)",
                  [id, speakers[i]["speakers_id"]]
                );
                countOperation.push(speakerRow.affectedRows);
              }

              if (countOperation.length > 0) {
                notif.msg = "Данные успешно изменены!";
                notif.status = "success";
              } else {
                notif.msg =
                  "Данные изменены лишь частично, обратитесь к администратору";
                notif.status = "danger";
              }

              return res.json(notif);
            } else {
              notif.msg =
                "При обновлении возникла ошибка, обратитесь к администратору";
              notif.status = "danger";
              return res.json(notif);
            }
          } else {
            notif.msg = "Такой материал не найден! Обратитесь к администратору";
            notif.status = "danger";
            return res.json(notif);
          }
        } catch (e) {
          notif.msg = "Ошибка операции";
          notif.status = "danger";
          console.log(e);
          return res.json(notif);
        }
      }
    });
  }
);

app.get("/admin/event/add", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [speakers, fields] = await connect.query(
          "SELECT * FROM speakers ORDER BY surname ASC LIMIT 5 "
        );

        const [cat, fields2] = await connect.query(
          "SELECT * FROM category_events"
        );
        const [centers, fields4] = await connect.query("SELECT * FROM centers");
        const [organizations, fields3] = await connect.query(
          "SELECT * FROM organizations"
        );
        return res.json({ speakers, cat, organizations, centers });
      } catch (e) {
        return res.json(e.message);
      }
    }
  });
});

app.post(
  "/admin/event/add",
  ensureToken,
  upload.single("file"),
  async (req, res) => {
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
      if (err) {
        res.json({
          code: 403,
        });
      } else {
        let body = JSON.parse(req.body.event);

        let organization_id = JSON.parse(req.body.organizationId);
        let center_id = JSON.parse(req.body.centerId)
          ? JSON.parse(req.body.centerId)
          : "";

        const title = body["title"];
        const description = body["description"];

        const category_id = body["category_id"];

        const date_event = body["date_event"];
        const time_event = body["time_event"];
        const location = body["location"];
        const target_audience = body["target_audience"];
        const participants_number = body["participants_number"];
        const event_status = body["event_status"] ? body["event_status"] : 1;
        const published = body["published"] ? body["published"] : 1;
        const limitEnrollers = body["limit"] === "true" ? "true" : "";
        const additional_link = body["additional_link"];

        const eventDt = date_event + " " + time_event;
        const event_uniq = uuidv4();

        const tmp = body["speakers"];

        let tmpArray = [];

        function itemCheck(item) {
          if (tmpArray.indexOf(item.id) === -1) {
            tmpArray.push(item.id);
            return true;
          }
          return false;
        }

        const speakers = tmp.filter((item) => itemCheck(item));

        let file = "event_bg.jpg";

        if (req.file) {
          file = req.file.filename;
        }

        const notif = {};
        try {
          const [row, filelds] = await connect.query(
            "INSERT INTO events " +
              "(`id_uniq`,`title`,`description`,`category_id`,`organization_id`,`center_id`,`date_event`,`location`,`target_audience`,`participants_number`, `limit_enrollers`, `picture_name`,`additional_link`,`event_status`,`author`,`published`) " +
              "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
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
              limitEnrollers,
              file,
              additional_link,
              event_status,
              "admin",
              published,
            ]
          );

          if (row.insertId > 0) {
            notif.msg = "Мероприятие успешно добавлено!!";
            notif.status = "success";
            const countOperation = [];
            for (let i = 0; i < speakers.length; i++) {
              const [
                speakerRow,
                fields,
              ] = await connect.query(
                "INSERT INTO relationship_events_speakers (`event_id`,`speakers_id`) VALUES (?,?)",
                [event_uniq, speakers[i]["id"]]
              );
              countOperation.push(speakerRow.affectedRows);
            }
            // console.log(countOperation)
            if (countOperation.length > 0) return res.json(notif);
            return false;
          } else {
            notif.msg =
              "При обновлении возникла ошибка, обратитесь к администратору";
            notif.status = "danger";
            return res.json(notif);
          }
        } catch (e) {
          notif.msg =
            "Ошибка при добавлении материала, обратитесь к администратору";
          notif.status = "danger";
          console.log(e.message);
          return res.json(notif);
        }
      }
    });
  }
);

app.get("/admin/event/show_enrollers/:id", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const id = req.params.id;

        if (id.length > 0) {
          const result = {};

          const [
            getTitleEvent,
            fields1,
          ] = await connect.query(
            `SELECT title FROM events WHERE id_uniq = ?`,
            [id]
          );

          if (getTitleEvent.length > 0) {
            result.title = getTitleEvent[0]["title"];

            const [usersList, fields] = await connect.query(
              `SELECT  e.id, e.surname , e.firstname, e.email,
                        e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM 
                        enrollers as e INNER JOIN area as a ON e.area_id = a.id_area 
                        INNER JOIN events as event ON e.event_id = event.id_uniq WHERE event.id_uniq = ?`,
              [id]
            );
            result.enrollers = usersList;
            return res.json(result);
          }

          return res.json([]);
        } else {
          return res.json([]);
        }
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get(
  "/admin/event/show_enrollers_for_excel/:id",
  ensureToken,
  async (req, res) => {
    jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
      if (err) {
        res.json({
          code: 403,
        });
      } else {
        try {
          const id = req.params.id;

          if (id.length > 0) {
            const [
              getTitleEvent,
              fields1,
            ] = await connect.query(
              `SELECT title FROM events WHERE id_uniq = ?`,
              [id]
            );

            if (getTitleEvent.length > 0) {
              const [usersList, fields] = await connect.query(
                `SELECT  e.surname as 'Фамилия', e.firstname as 'Имя',  e.patronymic as 'Отчество', e.email as 'Эл.почта',
                        e.phone as 'Телефон', e.position as 'Должность', e.company as 'Место работы', e.experience as 'Стаж',  a.title_area as 'Район' FROM 
                        enrollers as e INNER JOIN area as a ON e.area_id = a.id_area 
                        INNER JOIN events as event ON e.event_id = event.id_uniq WHERE event.id_uniq = ?`,
                [id]
              );

              console.log(usersList);

              return res.json(usersList);
            }

            return res.json([]);
          } else {
            return res.json([]);
          }
        } catch (e) {
          console.log(e.message);
        }
      }
    });
  }
);

app.get("/admin/event/delete/:id", ensureToken, async (req, res) => {
  const id = req.params.id;

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const notif = {};
        const [
          checkRowDel,
          fields2,
        ] = await connect.query(
          "SELECT id_uniq FROM events WHERE id_uniq = ?",
          [id]
        );

        if (checkRowDel.length > 0) {
          const [
            checkEmptySubscribes,
            fields3,
          ] = await connect.query(
            `SELECT COUNT(id) as count FROM enrollers WHERE event_id = ?`,
            [id]
          );

          if (checkEmptySubscribes[0]["count"] === 0) {
            const [
              enrroler,
              fields,
            ] = await connect.query("DELETE FROM events WHERE id_uniq = ?", [
              id,
            ]);

            if (enrroler.affectedRows > 0) {
              notif.msg = "Мероприятие удалено!";
              notif.status = "success";
              notif.code = 200;

              return res.json(notif);
            }

            notif.msg =
              "Не удалось удалить мероприятие! Обратитесь к администратору!";
            notif.status = "danger";
            notif.code = 500;
            return res.json(notif);
          } else {
            notif.msg =
              "Не удалось удалить мероприятие! Необходимо удалить всех зарегистрированных на мероприятие пользователей!";
            notif.status = "danger";
            notif.code = 500;
            return res.json(notif);
          }
        } else {
          notif.msg = "Мероприятияе не найдено!";
          notif.status = "danger";
          notif.code = 201;
          return res.json(notif);
        }
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.post("/admin/event/search", async (req, res) => {
  const params = JSON.parse(req.body.params).trim();
  // const sql = `SELECT e.id, e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,
  // DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e
  // INNER JOIN category_events as c ON e.category_id = c.id
  // INNER JOIN register_status ON register_status.id = e.event_status WHERE e.title LIKE '%${params}%''
  // ORDER BY e.date_event DESC LIMIT 5`;
  try {
    // const sql = `SELECT * FROM events WHERE title LIKE '%${params}%' ORDER BY date_event LIMIT 5`;
    // console.log(sql);

    const sql = `SELECT e.id, e.id_uniq, e.title, e.category_id, DATE_FORMAT(e.date_event, "%d-%m-%Y") as date_event, e.picture_name, e.event_status,
  DATE_FORMAT(e.created_at, "%d-%m-%Y") as dc, e.author, e.published, c.cat_name, register_status.title as status FROM events as e
  INNER JOIN category_events as c ON e.category_id = c.id
  INNER JOIN register_status ON register_status.id = e.event_status WHERE e.title LIKE '%${params}%'
  ORDER BY e.date_event DESC LIMIT 5`;

    const [result, fields] = await connect.query(sql);

    console.log(result);

    return res.status(200).json(result);
  } catch (e) {
    console.log(e.message);
  }
});

// USERS enrollers

app.get("/admin/enrollers/:params", ensureToken, async (req, res) => {
  const params = JSON.parse(req.params.params);
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const offset =
          params.firstIndex > 0 ? `OFFSET ${params.firstIndex}` : "";
        const limit = `LIMIT 5`;

        // const [speakerList, fields] = await connect.query(
        //   `SELECT * FROM speakers ORDER BY surname  ${limit} ${offset}`
        // );

        const [usersList, fields] = await connect.query(
          `SELECT  e.id, e.surname , e.firstname, e.email,
            e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM 
            enrollers as e INNER JOIN area as a ON e.area_id = a.id_area 
            INNER JOIN events as event ON e.event_id = event.id_uniq ${limit} ${offset}`
        );
        res.json(usersList);
      } catch (e) {
        console.log(e.message);
      }

      // try {
      //   const [usersList, fields] = await connect.query(
      //     "SELECT  e.id, e.surname , e.firstname, e.email," +
      //       "e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM " +
      //       "enrollers as e INNER JOIN area as a ON e.area_id = a.id_area " +
      //       "INNER JOIN events as event ON e.event_id = event.id_uniq"
      //   );
      //   res.json(usersList);
      // } catch (e) {
      //   console.log(e.message);
      // }
    }
  });
});

app.get("/admin/enroller/:id", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [
          usersList,
          fields,
        ] = await connect.query(
          "SELECT  e.id, e.surname , e.firstname,e.patronymic, e.email," +
            "e.phone, e.position, e.company, e.experience, e.uniq_serial_for_link, a.id_area, a.title_area, event.title, event.id_uniq FROM " +
            "enrollers as e INNER JOIN area as a ON e.area_id = a.id_area " +
            "INNER JOIN events as event ON e.event_id = event.id_uniq WHERE e.uniq_serial_for_link = ?",
          [req.params.id]
        );
        res.json(usersList);
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/admin/enroller/delete/:id", ensureToken, async (req, res) => {
  const id = req.params.id;

  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const notif = {};
        const [
          checkEnrollerDel,
          fields2,
        ] = await connect.query(
          "SELECT id FROM enrollers WHERE uniq_serial_for_link = ?",
          [id]
        );
        if (checkEnrollerDel.length > 0) {
          const [
            enrroler,
            fields,
          ] = await connect.query(
            "DELETE FROM enrollers WHERE uniq_serial_for_link = ?",
            [id]
          );
          if (enrroler.affectedRows > 0) {
            notif.msg = "Пользователь удален!";
            notif.status = "success";
            notif.code = 200;

            return res.json(notif);
          }

          notif.msg =
            "Не удалось удалить пользовталея! Обратитесь к администратору!";
          notif.status = "danger";
          notif.code = 500;
          return res.json(notif);
        } else {
          notif.msg = "Такой пользователь не найден!";
          notif.status = "danger";
          notif.code = 201;
          return res.json(notif);
        }
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

// USER ADMIN

app.get("/login", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      try {
        const [checkRow, fields] = await connect.query("SELECT * FROM users");
        return res.json(checkRow);
      } catch (e) {
        console.log(e.message);
      }
    } else {
      res.json({
        code: 301,
      });
    }
  });
});

app.post("/login", upload.single("file"), async (req, res) => {
  const login = req.body?.login;
  const password = req.body?.password;

  let token = null;
  const notif = {};
  try {
    const [
      checkUser,
      fileds,
    ] = await connect.query(
      "SELECT id FROM users WHERE `login` = ? AND `password` = ?",
      [login, password]
    );
    if (checkUser.length > 0) {
      let tt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 24 * 10000;

      try {
        // token = jwt.sign(checkUser[0]["id"], process.env.SECRET_KEY);
        token = jwt.sign(
          {
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 24 * 10000,
            data: checkUser[0]["id"],
          },
          process.env.SECRET_KEY
        );
        notif.msg = process.env.WELCOME_MSG_RU;
        notif.status = "success";
        notif.token = token;
        return res.json(notif);
      } catch (e) {
        console.log(e);
      }
    }
    notif.msg = process.env.LOGIN_MSG_WRONG;
    notif.status = "danger";
    return res.json(notif);
  } catch (e) {
    console.log(e.message);
  }
});

// REPORTS
app.get("/admin/report", ensureToken, async (req, res) => {
  jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
    if (err) {
      res.json({
        code: 403,
      });
    } else {
      try {
        const [events, fields] = await connect.query(
          "SELECT COUNT(id) as count FROM events"
        );
        const [enrollers, fields2] = await connect.query(
          "SELECT COUNT(id) as count FROM enrollers"
        );
        const [speakers, fields3] = await connect.query(
          "SELECT COUNT(id) as count FROM speakers"
        );
        const [categories, fields4] = await connect.query(
          "SELECT * FROM category_events"
        );
        const [organizations, fields5] = await connect.query(
          "SELECT * FROM organizations"
        );
        const [centers, fields6] = await connect.query("SELECT * FROM centers");
        res.json({
          events,
          enrollers,
          speakers,
          categories,
          organizations,
          centers,
        });
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.post(
  "/admin/report/events",
  ensureToken,
  upload.single("file"),
  async (req, res) => {
    const eventData = {};
    if (req.body.event.length > 0) {
      console.log("fffffff");
      let body = JSON.parse(req.body.event);
      const notif = {};

      console.log("start " + body.centerId);

      const year = body.year === "all" ? " " : " = " + body.year;
      const month = body.month === "all" ? " " : " = " + body.month;
      const categoryId =
        body.categoryId == "all" ? " " : " = " + body.categoryId;
      const organizationId =
        body.organizationId == "all" ? " " : " = " + body.organizationId;
      const centerId = body.centerId === "all" ? " " : " = " + body.centerId;
      const actual = body.actual;

      const ryear = body.year === "all" ? "не указано" : body.year;
      const rmonth = body.month === "all" ? "не указано" : body.month;
      const rcategoryId =
        body.categoryId == "all" ? "не указано" : body.categoryId;
      const rorganizationId =
        body.organizationId == "all" ? "не указано " : body.organizationId;
      const rcenterId = body.centerId === "all" ? "не указано" : body.centerId;

      eventData.year = ryear;
      eventData.month = rmonth;
      eventData.categoryId = rcategoryId;
      eventData.organizationId = rorganizationId;
      eventData.centerId = rcenterId;
      eventData.actual = actual;

      jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
          notif.code = 403;
          res.json(notif);
        } else {
          console.log("here");
          try {
            const sql = `SELECT COUNT(*) as count FROM events as e
                    WHERE e.category_id ${categoryId} AND e.organization_id ${organizationId} 
                    AND MONTH(e.date_event) ${month}  AND YEAR(e.date_event) ${year}
                    AND e.event_status = ${actual} AND e.center_id ${centerId} `;

            const [amountRows, filelds] = await connect.query(sql);

            if (amountRows.length > 0) {
              eventData.count = amountRows[0]["count"];
              notif.code = 200;
              notif.msg = "Получена статистка!";
              notif.status = "success";
              notif.result = eventData;
              return res.json(notif);
            }

            notif.msg = "Не удалось добавить изменения!";
            notif.status = "danger";

            return res.json(notif);
          } catch (e) {
            console.log(e.message);
            notif.msg =
              "Возникла ошибка, обратитесь к администратору" + e.message;
            notif.status = "danger";
            return res.json(notif);
          }
        }
      });
    }
  }
);

app.post(
  "/admin/report/enrollers",
  ensureToken,
  upload.single("file"),
  async (req, res) => {
    const eventData = {};
    if (req.body.event.length > 0) {
      let body = JSON.parse(req.body.event);
      const notif = {};

      const year = body.year === "all" ? " " : " = " + body.year;
      const month = body.month === "all" ? " " : " = " + body.month;
      const categoryId =
        body.categoryId == "all" ? " " : " = " + body.categoryId;
      const organizationId =
        body.organizationId == "all" ? " " : " = " + body.organizationId;
      const centerId = body.centerId === "all" ? " " : " = " + body.centerId;
      const actual = body.actual;

      const ryear = body.year === "all" ? "не указано" : body.year;
      const rmonth = body.month === "all" ? "не указано" : body.month;
      const rcategoryId =
        body.categoryId == "all" ? "не указано" : body.categoryId;
      const rorganizationId =
        body.organizationId == "all" ? "не указано " : body.organizationId;
      const rcenterId = body.centerId === "all" ? "не указано" : body.centerId;

      eventData.year = ryear;
      eventData.month = rmonth;
      eventData.categoryId = rcategoryId;
      eventData.organizationId = rorganizationId;
      eventData.centerId = rcenterId;
      eventData.actual = actual;

      jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
          notif.code = 403;
          res.json(notif);
        } else {
          try {
            const sql = `SELECT COUNT(*) as count FROM enrollers as en 
                    INNER JOIN events as e ON en.event_id = e.id_uniq  WHERE e.category_id ${categoryId}
                    AND e.organization_id ${organizationId} AND MONTH(e.date_event) ${month}  AND YEAR(e.date_event) ${year}
                    AND e.event_status = ${actual} AND e.center_id ${centerId} `;

            const [amountRows, filelds] = await connect.query(sql);

            console.log(amountRows);

            if (amountRows.length > 0) {
              eventData.count = amountRows[0]["count"];
              notif.code = 200;
              notif.msg = "Получена статистка!";
              notif.status = "success";
              notif.result = eventData;
              return res.json(notif);
            }

            notif.msg = "Не удалось получить статистику!";
            notif.status = "danger";

            return res.json(notif);
          } catch (e) {
            console.log(e.message);
            notif.msg =
              "Возникла ошибка, обратитесь к администратору" + e.message;
            notif.status = "danger";
            return res.json(notif);
          }
        }
      });
    }
  }
);

app.post(
  "/admin/report/enrollers_list",
  ensureToken,
  upload.single("file"),
  async (req, res) => {
    console.log("sdsdsd");

    const eventData = {};
    if (req.body.event.length > 0) {
      let body = JSON.parse(req.body.event);
      const notif = {};

      const year = body.year === "all" ? " " : " = " + body.year;
      const month = body.month === "all" ? " " : " = " + body.month;
      const categoryId =
        body.categoryId == "all" ? " " : " = " + body.categoryId;
      const organizationId =
        body.organizationId == "all" ? " " : " = " + body.organizationId;
      const centerId = body.centerId === "all" ? " " : " = " + body.centerId;
      const actual = body.actual;

      const ryear = body.year === "all" ? "не указано" : body.year;
      const rmonth = body.month === "all" ? "не указано" : body.month;
      const rcategoryId =
        body.categoryId == "all" ? "не указано" : body.categoryId;
      const rorganizationId =
        body.organizationId == "all" ? "не указано " : body.organizationId;
      const rcenterId = body.centerId === "all" ? "не указано" : body.centerId;

      eventData.year = ryear;
      eventData.month = rmonth;
      eventData.categoryId = rcategoryId;
      eventData.organizationId = rorganizationId;
      eventData.centerId = rcenterId;
      eventData.actual = actual;

      jwt.verify(req.token, process.env.SECRET_KEY, async function (err, data) {
        if (err) {
          notif.code = 403;
          res.json(notif);
        } else {
          try {
            const sql = `SELECT en.surname as Фамилия, en.firstname as Имя, en.patronymic as Отчество, en.email as 'Эл. адрес', en.phone as Телефон,
                    en.position as Должность, en.company as 'Место работы', en.experience as 'стаж', DATE_FORMAT(en.created_at, "%d-%m-%Y") as 'Дата регистрации', a.title_area as 'город/район' FROM enrollers as en 
                    INNER JOIN events as e ON en.event_id = e.id_uniq
                    INNER JOIN area as a ON en.area_id = a.id_area  WHERE e.category_id ${categoryId}
                    AND e.organization_id ${organizationId} AND MONTH(e.date_event) ${month}  AND YEAR(e.date_event) ${year}
                    AND e.event_status = ${actual} AND e.center_id ${centerId} `;

            const [rows, filelds] = await connect.query(sql);

            console.log(rows);

            if (rows.length > 0) {
              eventData.enrollers = rows;
              notif.code = 200;
              notif.msg = "Получена статистка!";
              notif.status = "success";
              notif.result = eventData;
              return res.json(notif);
            }

            notif.msg = "Пустой список!";
            notif.status = "success";
            eventData.enrollers = [];
            notif.result = eventData;

            return res.json(notif);
          } catch (e) {
            console.log(e.message);
            notif.msg =
              "Возникла ошибка, обратитесь к администратору" + e.message;
            notif.status = "danger";
            return res.json(notif);
          }
        }
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
