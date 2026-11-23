package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TeamMemberEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * team_members 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TeamMemberMapper {

    @Select("SELECT * FROM team_members WHERE team_id = #{teamId} AND user_id = #{userId}")
    TeamMemberEntity find(@Param("teamId") String teamId, @Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM team_members WHERE team_id = #{teamId}")
    long countByTeam(@Param("teamId") String teamId);

    @Insert("INSERT INTO team_members(team_id,user_id,role,envelope,joined)"
            + " VALUES(#{teamId},#{userId},#{role},#{envelope},#{joined})")
    int insert(TeamMemberEntity member);

    @Update("UPDATE team_members SET role = #{role} WHERE team_id = #{teamId} AND user_id = #{userId}")
    int updateRole(@Param("teamId") String teamId, @Param("userId") String userId, @Param("role") String role);

    @Delete("DELETE FROM team_members WHERE team_id = #{teamId} AND user_id = #{userId}")
    int delete(@Param("teamId") String teamId, @Param("userId") String userId);

    @Delete("DELETE FROM team_members WHERE team_id = #{teamId}")
    int deleteForTeam(@Param("teamId") String teamId);
}
