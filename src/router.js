import { createRouter, createWebHistory } from 'vue-router'
import CalendarView from './views/CalendarView.vue'
import ClassicView from './views/ClassicView.vue'
import GroupsView from './views/GroupsView.vue'
import GroupView from './views/GroupView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: CalendarView },
    { path: '/:year(\\d{4}):month(\\d{2})/', component: CalendarView },
    { path: '/classic', component: ClassicView },
    { path: '/groups', component: GroupsView },
    { path: '/group/:name', component: GroupView },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

export default router
