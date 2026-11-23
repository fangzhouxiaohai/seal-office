package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TeamVersionEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * team_versions 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TeamVersionMapper {

    @Insert("INSERT INTO team_versions(id,team_id,node_id,version,blob,bytes,created,actor_id)"
            + " VALUES(#{id},#{teamId},#{nodeId},#{version},#{blob},#{bytes},#{created},#{actorId})")
    int insert(TeamVersionEntity version);

    @Select("SELECT * FROM team_versions WHERE team_id = #{teamId} AND node_id = #{nodeId}"
            + " ORDER BY version DESC LIMIT 1")
    TeamVersionEntity latest(@Param("teamId") String teamId, @Param("nodeId") String nodeId);

    @Select("SELECT * FROM team_versions WHERE team_id = #{teamId} AND node_id = #{nodeId} AND version = #{version}")
    TeamVersionEntity atVersion(@Param("teamId") String teamId, @Param("nodeId") String nodeId,
                                @Param("version") long version);

    @Select("SELECT blob FROM team_versions WHERE team_id = #{teamId}")
    List<String> blobsForTeam(@Param("teamId") String teamId);

    @Select("SELECT blob FROM team_versions WHERE node_id = #{nodeId} AND team_id = #{teamId}")
    List<String> blobsForNode(@Param("teamId") String teamId, @Param("nodeId") String nodeId);

    @Delete("DELETE FROM team_versions WHERE team_id = #{teamId}")
    int deleteForTeam(@Param("teamId") String teamId);

    @Delete("DELETE FROM team_versions WHERE node_id = #{nodeId} AND team_id = #{teamId}")
    int deleteForNode(@Param("teamId") String teamId, @Param("nodeId") String nodeId);
}
