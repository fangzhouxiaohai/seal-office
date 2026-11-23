package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TeamNodeEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * team_nodes 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TeamNodeMapper {

    @Select("SELECT * FROM team_nodes WHERE id = #{id} AND team_id = #{teamId}")
    TeamNodeEntity find(@Param("id") String id, @Param("teamId") String teamId);

    @Select("SELECT * FROM team_nodes WHERE team_id = #{teamId} ORDER BY updated DESC")
    List<TeamNodeEntity> listFor(@Param("teamId") String teamId);

    @Insert("INSERT INTO team_nodes(id,team_id,parent,kind,meta,updated)"
            + " VALUES(#{id},#{teamId},#{parent},#{kind},#{meta},#{updated})")
    int insert(TeamNodeEntity node);

    @Update("UPDATE team_nodes SET version = #{version}, updated = #{updated} WHERE id = #{id}")
    int updateVersion(@Param("id") String id, @Param("version") long version, @Param("updated") long updated);

    @Update("UPDATE team_nodes SET parent = #{parent}, meta = #{meta}, updated = #{updated} WHERE id = #{id}")
    int updateMetaParent(@Param("id") String id, @Param("parent") String parent,
                         @Param("meta") String meta, @Param("updated") long updated);

    @Delete("DELETE FROM team_nodes WHERE id = #{id} AND team_id = #{teamId}")
    int delete(@Param("id") String id, @Param("teamId") String teamId);

    @Delete("DELETE FROM team_nodes WHERE team_id = #{teamId}")
    int deleteForTeam(@Param("teamId") String teamId);

    /** 递归删除的子树展开（等价于 Node 的 WITH RECURSIVE tree 查询，用逐层展开实现） */
    @Select("SELECT id FROM team_nodes WHERE parent = #{parent} AND team_id = #{teamId}")
    List<String> childrenOf(@Param("teamId") String teamId, @Param("parent") String parent);
}
