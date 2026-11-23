package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TeamEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * teams 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TeamMapper {

    @Select("SELECT * FROM teams WHERE id = #{id}")
    TeamEntity findById(@Param("id") String id);

    @Select("SELECT COUNT(*) FROM teams WHERE owner_id = #{ownerId}")
    long countByOwner(@Param("ownerId") String ownerId);

    @Insert("INSERT INTO teams(id,owner_id,meta,created) VALUES(#{id},#{ownerId},#{meta},#{created})")
    int insert(TeamEntity team);

    @Update("UPDATE teams SET meta = #{meta} WHERE id = #{id}")
    int updateMeta(@Param("id") String id, @Param("meta") String meta);

    @Delete("DELETE FROM teams WHERE id = #{id}")
    int deleteById(@Param("id") String id);
}
