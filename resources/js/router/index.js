import { createWebHistory, createWebHashHistory, createRouter } from 'vue-router'

// Use hash history for Capacitor builds (no server), web history for browser SPA
const history = import.meta.env.VITE_TARGET === 'capacitor'
  ? createWebHashHistory()
  : createWebHistory()

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
    history,
    routes, // short for `routes: routes`
    scrollBehavior() {
        // Always scroll to top on route change
        return { top: 0, behavior: 'smooth' }
    }
})

// Solution: Reset body overflow after every route change
router.afterEach(() => {
    // Force the body to be scrollable again
    document.body.style.overflow = 'auto';
    // Remove any inline styles that might have been left on HTML
    document.documentElement.style.overflow = 'auto';
});

// Navigation guard: redirect from /register if registration is disabled
router.beforeEach(async (to, from, next) => {
    if (to.name === 'register') {
        const { useAuthStore } = await import('../stores/auth');
        const authStore = useAuthStore();
        if (!authStore.registrationEnabled) {
            return next({ name: 'login' });
        }
    }
    next();
});

export default router
