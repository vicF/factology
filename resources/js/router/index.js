import { createWebHistory, createRouter } from 'vue-router'
import store from '@/store'

/* Guest Component */
const Login = () => import('@/components/Login.vue')
const Register = () => import('@/components/Register.vue')
/* Guest Component */

/* Layouts */
const DahboardLayout = () => import('@/components/layouts/Default.vue')
/* Layouts */

/* Authenticated Component */
const Search = () => import('@/components/Search.vue')
/* Authenticated Component */


const routes = [

    {
        path: "/",
        component: DahboardLayout,
        meta: {
            //middleware: "guest"
            //middleware: "auth"
        },
        children: [
            {
                name: "dashboard",
                path: '/',
                component: Search,
                meta: {
                    title: `Dashboard`
                }
            },
            {
                name: "login",
                path: "/login",
                component: Login,
                meta: {
                    //middleware: "guest",
                    title: `Login`
                }
            },
            {
                name: "register",
                path: "/register",
                component: Register,
                meta: {
                    //middleware: "guest",
                    title: `Register`
                }
            }
        ]
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes, // short for `routes: routes`
})

/*router.beforeEach((to, from, next) => {
    document.title = to.meta.title
    if (to.meta.middleware == "guest") {
        if (store.state.auth.authenticated) {
            next({ name: "dashboard" })
        }
        next()
    } else {
        if (store.state.auth.authenticated) {
            next()
        } else {
            next({ name: "login" })
        }
    }
})*/

export default router
