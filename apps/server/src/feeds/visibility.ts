import { sql, type SQL } from 'drizzle-orm'

/**
 * 用户可见 feed 集合 = 个人订阅 ∪ 已关注且仍对其可见的 Collection 中的 feed。
 *
 * 这是数据范围的唯一定义：Web API、MCP、RSS 输出、检索都必须经过这里，
 * 不允许在路由里另写一份权限查询。返回可直接用于 `feed_id IN (...)` 的子查询。
 */
export function visibleFeedIds(userId: string): SQL {
  return sql`(
    select s.feed_id from subscriptions s where s.user_id = ${userId}
    union
    select cf.feed_id
    from collection_follows fo
    join collections c on c.id = fo.collection_id
    join collection_feeds cf on cf.collection_id = c.id
    where fo.user_id = ${userId} and ${collectionVisibleTo(userId, sql`c`)}
  )`
}

/**
 * Collection 对用户可见：公开、自己创建，或部门可见且用户属于该部门或其下级部门。
 * 下级关系通过向上递归用户所在部门的祖先链来判断。
 */
export function collectionVisibleTo(userId: string, alias: SQL): SQL {
  return sql`(
    ${alias}.visibility = 'public'
    or ${alias}.owner_user_id = ${userId}
    or (
      ${alias}.visibility = 'department'
      and ${alias}.department_id in (
        with recursive ancestry(id, parent_id) as (
          select d.id, d.parent_id from departments d
          join user_departments ud on ud.department_id = d.id
          where ud.user_id = ${userId}
          union
          select p.id, p.parent_id from departments p join ancestry a on p.id = a.parent_id
        )
        select id from ancestry
      )
    )
  )`
}
