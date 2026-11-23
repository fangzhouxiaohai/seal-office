package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.TeamInviteEntity;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * team_invites 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface TeamInviteMapper {

    @Select("SELECT * FROM team_invites WHERE id = #{id}")
    TeamInviteEntity findById(@Param("id") String id);

    @Select("SELECT id FROM team_invites WHERE id = #{id} AND team_id = #{teamId}")
    String findIdInTeam(@Param("id") String id, @Param("teamId") String teamId);

    @Select("SELECT COUNT(*) FROM team_invites WHERE team_id = #{teamId}")
    long countByTeam(@Param("teamId") String teamId);

    @Insert("INSERT INTO team_invites(id,team_id,inviter_id,recipient_id,role,access_hash,envelope,expires,created)"
            + " VALUES(#{id},#{teamId},#{inviterId},#{recipientId},#{role},#{accessHash},#{envelope},#{expires},#{created})")
    int insert(TeamInviteEntity invite);

    @Update("UPDATE team_invites SET revoked = 1 WHERE id = #{id}")
    int revoke(@Param("id") String id);

    @Update("UPDATE team_invites SET revoked = 1 WHERE team_id = #{teamId}"
            + " AND (recipient_id = #{userId} OR inviter_id = #{userId})")
    int revokeForMember(@Param("teamId") String teamId, @Param("userId") String userId);

    @Update("UPDATE team_invites SET accepted = 1 WHERE id = #{id}")
    int markAccepted(@Param("id") String id);

    @Delete("DELETE FROM team_invites WHERE team_id = #{teamId}")
    int deleteForTeam(@Param("teamId") String teamId);
}
