import { createWebHistory, createRouter } from 'vue-router'

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

const Object = () => import('@/components/Object.vue')


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
                    title: `Login`
                }
            },
            {
                name: "register",
                path: "/register",
                component: Register,
                meta: {
                    title: `Register`
                }
            },
            {
                name: "object",
                path: "/object/:uid",
                component: Object,
                meta: {
                    title: `Object`
                }
            }
        ]
    }
]

const router = createRouter({
    history: createWebHistory(),
    routes, // short for `routes: routes`
    scrollBehavior() {
        // Always scroll to top on route change
        return { top: 0, behavior: 'smooth' }
    }
})


export default router
