const { postgresCon } = require("./config");
const { projectsCountCache } = require("./app-config");
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const validateLoginForm = (data) => {
    const email = data['email'], password = data['password'];
    const emailRegex = /^\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;

    // check if email or password are empty
    if (email === '' || password === '' || email === undefined || password === undefined || email === null || password === null) {
        return -1;
    }
    //make sure email is of right format
    if (!emailRegex.test(email)) {
        return -1;
    }
    if (password.length < 6) {
        return -1;
    }
    return 1;
};

const validateRegisterForm = (data) => {
    const firstName = data['first-name'], lastName = data['last-name'], email = data['email'],
        password = data['password'], confirmPassword = data['confirm-password'];
    const emailRegex = /^\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;

    //check if any of the fields (except confirmPassword) are empty
    if (firstName === '' || lastName == '' || email === '' || password == ''
        || firstName === undefined || lastName == undefined || email === undefined || password == undefined
        || firstName === null || lastName == null || email === null || password == null) {
        return -1;
    }
    //makes sure email is of the right format
    if (!emailRegex.test(email)) {
        return -1;
    }
    if (confirmPassword !== password || password.length < 6) {
        return -1;
    }
    return 1;
};

const validateProjectForm = (data) => {
    console.log(data);
    const projectName = data['project-name'], projectDescription = data['project-description'];
    //check if any of the fields are empty
    if (projectName === '' || projectDescription === '' || projectName == undefined || projectDescription === undefined
        || projectName === null || projectDescription === null) {
        return -1;
    }
    return 1;
}

const getProjects = async (userId, page) => {
    const projects = [];
    try {
        const limit = 5;
        const offset = (page - 1) * limit;

        let res = await postgresCon().query("SELECT * from projects WHERE \"userId\" = " + userId + " ORDER BY \"updatedAt\"" + " OFFSET " + offset + " LIMIT " + limit);
        if(res.rows.length === 0) {
            res = await postgresCon().query("SELECT * from projects WHERE \"userId\" = " + userId + " ORDER BY \"updatedAt\"" + " OFFSET " + 0 + " LIMIT " + limit);
        }
        for (let row of res.rows) {
            projects.push(row);
        }
        return projects;
    }
    catch (err) {
        console.log(err);
        throw err;
    }
}

const getProjectCount = async (userId) => {
    const count = projectsCountCache.get(userId);
    // cache miss
    if(count === null || count === undefined || count === -1) {
        const countQuery = await postgresCon().query(`SELECT COUNT(*) FROM "projects" WHERE "userId" = ${userId}`); // pull the count from the db
        projectsCountCache.put(userId, countQuery.rows[0].count); // write to cache 
        return projectsCountCache.get(userId);
    }
    // return the count from the cache
    console.log("returning the count from the cache");
    return count;
}

const insertProject = async (data, token) => {
    let returnValue = -1;
    try {
        const userData = jwt.verify(token, 'secret1234');
        const str = "INSERT INTO projects (\"name\", \"description\", \"userId\") VALUES ('" + data['project-name'] + "', '" + data["project-description"] + "', " + userData.userId + ")";
        let res = await postgresCon().query(str);
        // check whether the count for the user exists in the cache 
        const projectsCount = projectsCountCache.get(userData.userId);
        if (projectsCount !== -1) {
            projectsCount++;
            projectsCountCache.put(userData.userId, projectsCount); // write to the cache
        }
        returnValue = 1;
    }
    catch (err) {
        returnValue = -1;
        throw err;
    }
    return returnValue;
}

const authorize = async (data) => {
    try {
        const email = data['email'], password = data['password'];

        let res = await postgresCon().query("SELECT * from users WHERE email = '" + email + "'");
        if (res.rows.length === 1) {
            return bcrypt.compare(password, res.rows[0].password).then((result) => {
                if (result) {
                    const payload = {
                        userId: res.rows[0].id,
                        email: res.rows[0].email,
                        name: res.rows[0].firstName + ' ' + res.rows[0].lastName
                    }

                    accessToken = jwt.sign(payload, 'secret1234', {
                        algorithm: "HS256",
                        expiresIn: 7200
                    });

                    return { msg: accessToken, status: 201 };
                }

                return { msg: 'failed', status: 401 };
            });
        }

        return { msg: 'failed', status: 401 };
    } catch (err) {
        return { msg: err, status: 500 };
    }
}

const registerUser = async (data) => {
    try {
        const firstName = data['first-name'];
        const lastName = data['last-name'];
        const email = data['email'];
        const password = data['password'];

        let res = await postgresCon().query("SELECT * from users WHERE email = '" + email + "'");

        if (res.rows.length > 0) {
            return { msg: "email is already in use", status: 409 }
        }

        const saltRounds = 10;

        bcrypt.genSalt(saltRounds, (err, salt) => {
            if (err) {
                throw err;
            }
            bcrypt.hash(password, salt, async (err, hash) => {
                if (err) {
                    throw err;
                }
                await postgresCon().query("INSERT INTO users (\"firstName\",\"lastName\", \"email\", \"password\") VALUES ('" + firstName + "', '" + lastName + "', '" + email + "', '" + hash + "')");
            });
        });

        return { msg: "success", status: 200 };
    }
    catch (err) {
        console.log(err);
        return { msg: err, status: 500 };
    }
}

module.exports =
{
    validateLoginForm,
    validateRegisterForm,
    validateProjectForm,
    getProjects,
    insertProject,
    authorize,
    registerUser,
    getProjectCount
};