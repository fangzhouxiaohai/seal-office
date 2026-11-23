package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TagEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * tags 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TagMapper {

    @Select("SELECT * FROM tags WHERE id = #{id} AND user_id = #{userId}")
    TagEntity findOwned(@Param("id") String id, @Param("userId") String userId);

    /** Node 的重复标识检查：SELECT id FROM tags WHERE id=?（不限用户） */
    @Select("SELECT id FROM tags WHERE id = #{id}")
    String findId(@Param("id") String id);

    @Select("SELECT COUNT(*) FROM tags WHERE user_id = #{userId}")
    long countByUser(@Param("userId") String userId);

    @Insert("INSERT INTO tags(id,user_id,meta,created) VALUES(#{id},#{userId},#{meta},#{created})")
    int insert(TagEntity tag);

    @Update("UPDATE tags SET meta = #{meta} WHERE id = #{id} AND user_id = #{userId}")
    int updateMeta(@Param("id") String id, @Param("userId") String userId, @Param("meta") String meta);

    @Delete("DELETE FROM tags WHERE id = #{id} AND user_id = #{userId}")
    int deleteOwned(@Param("id") String id, @Param("userId") String userId);
}
